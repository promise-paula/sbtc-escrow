;; title: sBTC Escrow Mainnet V3
;; version: 3.0.0
;; summary: Burn-block-based escrow with symmetric self-rescue, time-bound pause,
;;          integrator-safe beneficiary, per-escrow fee-recipient snapshot, and
;;          on-chain accounting for orphan sweep + invariant monitoring.
;; description: Successor to escrow-mainnet-v2. Charter and security analysis in
;;              docs/security/README.md. v3 closes the four highest-severity
;;              findings from the three-pass self-audit:
;;
;;  - [HIGH #3.5/#7.1] Asymmetric self-rescue
;;      v2: only the buyer can self-rescue a stuck dispute.
;;      v3: after 2x dispute-timeout, the seller can self-rescue a DELIVERED
;;          dispute too. No more buyer-can-grief-seller-via-absent-admin.
;;
;;  - [HIGH #4.1] Pause-bypass gap
;;      v2: admin can pause forever; PENDING/DELIVERED escrows had no
;;          user-initiated recovery during pause.
;;      v3: every pause is bounded (max 30 days). After pause-until-block,
;;          the contract is auto-operational. Admin can re-pause but each
;;          pause is bounded, removing the "admin pauses forever" risk.
;;
;;  - [HIGH #8.1] Integrator wrapper risk
;;      v2: contract-caller is sole buyer authority. Wrappers strip user
;;          agency.
;;      v3: optional (beneficiary (optional principal)) on create. If set,
;;          the beneficiary has the same authorization rights as the
;;          wrapper-buyer. Integrators can wrap us without stranding users.
;;
;;  - [MEDIUM #4.3] Mid-flight fee-recipient changes
;;      v2: fee on existing escrows pays out to whoever is fee-recipient
;;          when release happens.
;;      v3: fee-recipient is snapshot per-escrow at creation. Admin changes
;;          to the global recipient affect only future escrows.
;;
;;  - [#7.2] Direct-donation stuck funds + on-chain invariant monitoring
;;      v3: track total-locked-stx and total-locked-sbtc on every state
;;          change. New admin-only sweep-orphans function can withdraw
;;          (balance - locked), never touching escrow principal. Exposes
;;          get-contract-balance for off-chain monitor reuse.
;;
;; Clock change vs v2: all time-anchored values now use burn-block-height
;; (Bitcoin chain) instead of stacks-block-height. Bitcoin block production
;; is ~10 min average, very stable; 144 burn blocks reliably = 1 day. v2
;; used stacks-block-height which is highly variable post-Nakamoto, causing
;; user-facing UX bugs ("30 days" not actually meaning 30 days). All
;; duration constants below are tuned to wall-clock equivalents in burn
;; blocks. See docs/security/README.md #7.2 for the verification data.
;;
;; Token types (unchanged from v2):
;;   u0 = STX  (native Stacks token, 6 decimals / microSTX)
;;   u1 = sBTC (SIP-010 fungible token, 8 decimals / satoshis)

;; ============================================================================
;; CONSTANTS
;; ============================================================================

;; Contract deployer (set once at deployment, immutable)
(define-constant DEPLOYER tx-sender)

;; Token type constants
(define-constant TOKEN_STX u0)
(define-constant TOKEN_SBTC u1)

;; Error codes - Authorization
(define-constant ERR_UNAUTHORIZED (err u1001))
(define-constant ERR_CONTRACT_PAUSED (err u1002))
(define-constant ERR_OWNERSHIP_PENDING (err u1003))
(define-constant ERR_NOT_PENDING_OWNER (err u1004))

;; Error codes - Escrow
(define-constant ERR_ESCROW_NOT_FOUND (err u2001))
(define-constant ERR_ESCROW_ALREADY_COMPLETED (err u2002))
(define-constant ERR_ESCROW_EXPIRED (err u2003))
(define-constant ERR_ESCROW_NOT_EXPIRED (err u2004))
(define-constant ERR_INVALID_AMOUNT (err u2005))
(define-constant ERR_INVALID_DURATION (err u2006))
(define-constant ERR_SELF_ESCROW (err u2007))
(define-constant ERR_DISPUTE_NOT_TIMED_OUT (err u2008))
(define-constant ERR_NOT_DISPUTED (err u2009))
(define-constant ERR_INVALID_EXTENSION (err u2010))
(define-constant ERR_INVALID_TIMEOUT (err u2011))
(define-constant ERR_INVALID_TOKEN (err u2012))
(define-constant ERR_INVALID_BPS (err u2013))
(define-constant ERR_IN_REVIEW_PERIOD (err u2014))
(define-constant ERR_INVALID_STATUS (err u2015))
(define-constant ERR_NOT_DELIVERED (err u2016))
(define-constant ERR_SELF_BENEFICIARY (err u2017))

;; Error codes - Transfer
(define-constant ERR_TRANSFER_FAILED (err u3001))
(define-constant ERR_INSUFFICIENT_BALANCE (err u3002))

;; Error codes - Admin
(define-constant ERR_INVALID_PAUSE_DURATION (err u4001))
(define-constant ERR_SWEEP_EXCEEDS_FREE_BALANCE (err u4002))
(define-constant ERR_PAUSE_COOLDOWN_ACTIVE (err u4003))

;; Escrow status codes
(define-constant STATUS_PENDING u0)
(define-constant STATUS_RELEASED u1)
(define-constant STATUS_REFUNDED u2)
(define-constant STATUS_DISPUTED u3)
(define-constant STATUS_DELIVERED u4)

;; Platform configuration (immutable bounds)
(define-constant PLATFORM_FEE_BPS u50)        ;; 0.5% default platform fee
(define-constant MAX_FEE_BPS u500)            ;; 5% absolute ceiling
(define-constant BPS_DENOMINATOR u10000)

;; Time bounds in BURN blocks (144 / day, stable).
(define-constant MAX_DURATION u52560)         ;; ~365 days
(define-constant MIN_DURATION u1)             ;; ~10 min minimum
(define-constant MIN_DISPUTE_TIMEOUT u24)     ;; ~4 hours -- floor protects buyers
                                              ;; from admin shortening the window
                                              ;; below review.
(define-constant MAX_DISPUTE_TIMEOUT u8640)   ;; ~60 days
(define-constant DEFAULT_DISPUTE_TIMEOUT u4320) ;; ~30 days

;; Post-delivery review window. While inside this window after deliver(), the
;; buyer cannot unilaterally refund -- only release or dispute. Gives the
;; seller a guaranteed opportunity to dispute if the buyer is stalling
;; acceptance after work was delivered.
(define-constant REVIEW_PERIOD u24)           ;; ~4 hours

;; Time-bound pause (v3): each pause is capped to at most this many burn
;; blocks. After pause-until-block, is-operational returns true regardless
;; of the paused flag -- the contract auto-unpauses. Admin can re-arm but
;; can never pause indefinitely.
(define-constant MAX_PAUSE_DURATION u4320)    ;; ~30 days

;; Seller self-rescue: after this multiple of dispute-timeout has elapsed
;; since disputed-at, the seller can self-rescue if the escrow was DELIVERED
;; before the dispute. Closes the asymmetry where only buyers could escape
;; admin-absent disputes. (Self-audit #7.1)
(define-constant SELLER_RESCUE_MULTIPLIER u2)

;; Per-token amount bounds
(define-constant MIN_AMOUNT_STX u1000)              ;; 0.001 STX minimum
(define-constant MAX_AMOUNT_STX u100000000000000)   ;; 100M STX max
(define-constant MIN_AMOUNT_SBTC u10000)            ;; 0.0001 BTC (~$10) minimum
(define-constant MAX_AMOUNT_SBTC u10000000000)      ;; 100 BTC max

;; ============================================================================
;; DATA VARIABLES
;; ============================================================================

;; Contract state
(define-data-var contract-paused bool false)
(define-data-var pause-until-block uint u0)   ;; v3: burn block at which pause auto-lifts
;; Cooldown tracking: stores (block-when-cooldown-ends). On pause, set to
;; (pause-until-block + previous-pause-duration). Prevents admin from chaining
;; MAX_PAUSE_DURATION pauses back-to-back -- admin must give users operational
;; time at least equal to the previous pause length before re-arming.
(define-data-var pause-cooldown-until uint u0)
(define-data-var contract-owner principal DEPLOYER)
(define-data-var pending-owner (optional principal) none)
(define-data-var fee-recipient principal DEPLOYER)
(define-data-var platform-fee-bps uint PLATFORM_FEE_BPS)
(define-data-var dispute-timeout uint DEFAULT_DISPUTE_TIMEOUT)

;; Counters
(define-data-var escrow-nonce uint u0)

;; Per-token locked totals (v3): always equal sum (amount + fee) over live
;; escrows of that token. Used by sweep-orphans to compute how much excess
;; balance is safe to withdraw, and by get-contract-balance / on-chain
;; invariant monitor. Maintained on every state-mutating function.
(define-data-var total-locked-stx uint u0)
(define-data-var total-locked-sbtc uint u0)

;; Global statistics
(define-data-var total-escrows uint u0)
(define-data-var total-volume-stx uint u0)
(define-data-var total-volume-sbtc uint u0)
(define-data-var total-fees-collected-stx uint u0)
(define-data-var total-fees-collected-sbtc uint u0)
(define-data-var total-released uint u0)
(define-data-var total-refunded uint u0)
(define-data-var active-disputes uint u0)

;; ============================================================================
;; DATA MAPS
;; ============================================================================

;; Escrow storage. Two new fields vs v2:
;;   beneficiary    -- optional secondary authority (integrator-safe; #8.1)
;;   fee-recipient  -- per-escrow snapshot at creation (no mid-flight drift; #4.3)
(define-map escrows
  uint
  {
    buyer: principal,
    seller: principal,
    beneficiary: (optional principal),
    amount: uint,
    fee-amount: uint,
    fee-recipient: principal,
    token-type: uint,
    description: (string-utf8 256),
    status: uint,
    created-at: uint,
    expires-at: uint,
    completed-at: (optional uint),
    disputed-at: (optional uint),
    delivered-at: (optional uint)
  }
)

;; User statistics
(define-map user-stats
  principal
  {
    escrows-created: uint,
    escrows-received: uint,
    total-sent-stx: uint,
    total-sent-sbtc: uint,
    total-received-stx: uint,
    total-received-sbtc: uint
  }
)

;; ============================================================================
;; PRIVATE HELPER FUNCTIONS
;; ============================================================================

(define-private (calculate-fee (amount uint))
  (/ (* amount (var-get platform-fee-bps)) BPS_DENOMINATOR)
)

;; v3: pause auto-lifts after pause-until-block. is-operational checks both.
(define-private (is-operational)
  (or
    (not (var-get contract-paused))
    (>= burn-block-height (var-get pause-until-block))
  )
)

(define-private (is-owner)
  (is-eq contract-caller (var-get contract-owner))
)

(define-private (is-escrow-expired (expires-at uint))
  (> burn-block-height expires-at)
)

;; True iff the escrow's post-delivery review window has fully elapsed,
;; OR the escrow was never delivered (no review window applies).
(define-private (is-review-period-elapsed (delivered-at-opt (optional uint)))
  (match delivered-at-opt
    da (> burn-block-height (+ da REVIEW_PERIOD))
    true
  )
)

;; Get next escrow ID (atomic increment)
(define-private (get-next-escrow-id)
  (let ((current-id (var-get escrow-nonce)))
    (var-set escrow-nonce (+ current-id u1))
    (+ current-id u1)
  )
)

(define-private (ensure-user-stats (user principal))
  (default-to
    {
      escrows-created: u0,
      escrows-received: u0,
      total-sent-stx: u0,
      total-sent-sbtc: u0,
      total-received-stx: u0,
      total-received-sbtc: u0
    }
    (map-get? user-stats user)
  )
)

(define-private (is-valid-token-type (token-type uint))
  (or (is-eq token-type TOKEN_STX) (is-eq token-type TOKEN_SBTC))
)

(define-private (is-valid-amount (token-type uint) (amount uint))
  (if (is-eq token-type TOKEN_STX)
    (and (>= amount MIN_AMOUNT_STX) (<= amount MAX_AMOUNT_STX))
    (and (>= amount MIN_AMOUNT_SBTC) (<= amount MAX_AMOUNT_SBTC))
  )
)

;; v3: returns true if caller is the buyer OR the optional beneficiary.
;; Used in every buyer-authorized state mutation.
(define-private (is-buyer-or-beneficiary (caller principal) (escrow {
    buyer: principal, seller: principal, beneficiary: (optional principal),
    amount: uint, fee-amount: uint, fee-recipient: principal, token-type: uint,
    description: (string-utf8 256), status: uint, created-at: uint,
    expires-at: uint, completed-at: (optional uint),
    disputed-at: (optional uint), delivered-at: (optional uint)
  }))
  (or
    (is-eq caller (get buyer escrow))
    (match (get beneficiary escrow) b (is-eq caller b) false)
  )
)

;; Token-aware transfer helpers
(define-private (stx-withdraw (amount uint) (to principal))
  (as-contract? ((with-stx amount))
    (try! (stx-transfer? amount tx-sender to))
  )
)

(define-private (sbtc-deposit (amount uint) (from principal))
  (contract-call? 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token transfer amount from current-contract none)
)

(define-private (sbtc-withdraw (amount uint) (to principal))
  (as-contract? ((with-ft 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token "sbtc-token" amount))
    (try! (contract-call? 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token transfer amount tx-sender to none))
  )
)

;; Locked-balance accounting (v3). Called on every create / settlement.
(define-private (add-locked (token-type uint) (amount uint))
  (if (is-eq token-type TOKEN_STX)
    (var-set total-locked-stx (+ (var-get total-locked-stx) amount))
    (var-set total-locked-sbtc (+ (var-get total-locked-sbtc) amount))
  )
)

(define-private (sub-locked (token-type uint) (amount uint))
  (if (is-eq token-type TOKEN_STX)
    (var-set total-locked-stx (- (var-get total-locked-stx) amount))
    (var-set total-locked-sbtc (- (var-get total-locked-sbtc) amount))
  )
)

(define-private (add-volume (token-type uint) (amount uint))
  (if (is-eq token-type TOKEN_STX)
    (var-set total-volume-stx (+ (var-get total-volume-stx) amount))
    (var-set total-volume-sbtc (+ (var-get total-volume-sbtc) amount))
  )
)

(define-private (add-fees (token-type uint) (fee uint))
  (if (is-eq token-type TOKEN_STX)
    (var-set total-fees-collected-stx (+ (var-get total-fees-collected-stx) fee))
    (var-set total-fees-collected-sbtc (+ (var-get total-fees-collected-sbtc) fee))
  )
)

;; ============================================================================
;; AUTHORIZATION CHECKS (read-only for composability)
;; ============================================================================

(define-read-only (check-is-owner)
  (ok (asserts! (is-owner) ERR_UNAUTHORIZED))
)

(define-read-only (check-is-operational)
  (ok (asserts! (is-operational) ERR_CONTRACT_PAUSED))
)

;; ============================================================================
;; ADMIN FUNCTIONS
;; ============================================================================

;; v3: time-bound pause. Caller specifies duration in burn blocks, capped
;; at MAX_PAUSE_DURATION. After pause-until-block, is-operational returns
;; true automatically.
;;
;; Anti-chaining defense (v3 audit fix): each pause sets a cooldown equal
;; to the pause duration that must elapse before the admin can re-pause.
;; This caps total pause time at ~50% of any wall-clock window -- admin
;; can pause for 30 days, but must give users 30 days operational time
;; before pausing again. Removes the "admin pauses forever" risk while
;; allowing legitimate emergency re-pause after a normal cool-down.
(define-public (pause-contract (duration uint))
  (begin
    (try! (check-is-owner))
    (asserts! (> duration u0) ERR_INVALID_PAUSE_DURATION)
    (asserts! (<= duration MAX_PAUSE_DURATION) ERR_INVALID_PAUSE_DURATION)
    (asserts! (>= burn-block-height (var-get pause-cooldown-until))
              ERR_PAUSE_COOLDOWN_ACTIVE)
    (var-set contract-paused true)
    (var-set pause-until-block (+ burn-block-height duration))
    ;; cooldown ends `duration` blocks AFTER the pause itself ends
    (var-set pause-cooldown-until (+ (+ burn-block-height duration) duration))
    (print {
      event: "contract-paused",
      by: contract-caller,
      duration: duration,
      pause-until: (+ burn-block-height duration),
      cooldown-until: (+ (+ burn-block-height duration) duration),
      burn-block: burn-block-height
    })
    (ok true)
  )
)

;; Manual unpause. Does NOT shorten the cooldown -- the cooldown is anchored
;; to the originally-promised pause-until block, so admin can't use
;; pause-then-immediately-unpause to reset the cooldown counter to zero.
(define-public (unpause-contract)
  (begin
    (try! (check-is-owner))
    (var-set contract-paused false)
    (var-set pause-until-block u0)
    (print { event: "contract-unpaused", by: contract-caller, burn-block: burn-block-height })
    (ok true)
  )
)

(define-public (transfer-ownership (new-owner principal))
  (begin
    (try! (check-is-owner))
    (asserts! (not (is-eq new-owner (var-get contract-owner))) ERR_UNAUTHORIZED)
    (var-set pending-owner (some new-owner))
    (print { event: "ownership-transfer-initiated", from: contract-caller, to: new-owner })
    (ok true)
  )
)

(define-public (accept-ownership)
  (let ((pending (unwrap! (var-get pending-owner) ERR_OWNERSHIP_PENDING)))
    (asserts! (is-eq contract-caller pending) ERR_NOT_PENDING_OWNER)
    (var-set contract-owner pending)
    (var-set pending-owner none)
    (print { event: "ownership-transferred", new-owner: contract-caller })
    (ok true)
  )
)

(define-public (set-fee-recipient (recipient principal))
  (begin
    (try! (check-is-owner))
    (asserts! (not (is-eq recipient (var-get fee-recipient))) ERR_UNAUTHORIZED)
    (var-set fee-recipient recipient)
    (print { event: "fee-recipient-updated", recipient: recipient })
    (ok true)
  )
)

(define-public (set-platform-fee (fee-bps uint))
  (begin
    (try! (check-is-owner))
    (asserts! (<= fee-bps MAX_FEE_BPS) ERR_INVALID_AMOUNT)
    (var-set platform-fee-bps fee-bps)
    (print { event: "platform-fee-updated", fee-bps: fee-bps })
    (ok true)
  )
)

(define-public (set-dispute-timeout (timeout uint))
  (begin
    (try! (check-is-owner))
    (asserts! (>= timeout MIN_DISPUTE_TIMEOUT) ERR_INVALID_TIMEOUT)
    (asserts! (<= timeout MAX_DISPUTE_TIMEOUT) ERR_INVALID_TIMEOUT)
    (var-set dispute-timeout timeout)
    (print { event: "dispute-timeout-updated", timeout: timeout })
    (ok true)
  )
)

;; v3: sweep funds that are NOT locked in any escrow (e.g., direct donations).
;; The on-chain accounting guarantees we never touch escrow principal: the
;; amount sweepable is exactly (contract_balance - total_locked). Admin
;; provides the token-type and the expected sweep amount; we verify on-chain
;; before transferring. This both protects escrow funds and gives the admin
;; a tx-level commit to the number being withdrawn.
(define-public (sweep-orphans (token-type uint) (amount uint))
  (let (
    (recipient (var-get fee-recipient))
    (balance (if (is-eq token-type TOKEN_STX)
      (stx-get-balance current-contract)
      (unwrap-panic (contract-call? 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token get-balance current-contract))
    ))
    (locked (if (is-eq token-type TOKEN_STX)
      (var-get total-locked-stx)
      (var-get total-locked-sbtc)
    ))
    (free (if (>= balance locked) (- balance locked) u0))
  )
    (try! (check-is-owner))
    (asserts! (is-valid-token-type token-type) ERR_INVALID_TOKEN)
    (asserts! (> amount u0) ERR_INVALID_AMOUNT)
    (asserts! (<= amount free) ERR_SWEEP_EXCEEDS_FREE_BALANCE)

    (if (is-eq token-type TOKEN_STX)
      (try! (stx-withdraw amount recipient))
      (try! (sbtc-withdraw amount recipient))
    )

    (print {
      event: "orphans-swept",
      token-type: token-type,
      amount: amount,
      to: recipient,
      free-before: free,
      free-after: (- free amount),
      by: contract-caller
    })
    (ok true)
  )
)

;; ============================================================================
;; ESCROW CORE FUNCTIONS
;; ============================================================================

;; Create a new escrow. v3 differences from v2:
;;   - duration is in BURN BLOCKS (144 = 1 day, stable)
;;   - optional beneficiary co-authorized with buyer (integrator-safe)
;;   - fee-recipient is snapshotted into the escrow record
;;   - total-locked-{stx,sbtc} tracking maintained
(define-public (create-escrow
  (seller principal)
  (amount uint)
  (description (string-utf8 256))
  (duration uint)
  (token-type uint)
  (beneficiary (optional principal))
)
  (let (
    (buyer contract-caller)
    (escrow-id (get-next-escrow-id))
    (fee (calculate-fee amount))
    (total-amount (+ amount fee))
    (expires-at (+ burn-block-height duration))
    (fee-recipient-snapshot (var-get fee-recipient))
    (buyer-stats (ensure-user-stats buyer))
  )
    (try! (check-is-operational))

    ;; Validations
    (asserts! (> (len description) u0) ERR_INVALID_AMOUNT)
    (asserts! (not (is-eq buyer seller)) ERR_SELF_ESCROW)
    (asserts! (is-valid-token-type token-type) ERR_INVALID_TOKEN)
    (asserts! (is-valid-amount token-type amount) ERR_INVALID_AMOUNT)
    (asserts! (>= duration MIN_DURATION) ERR_INVALID_DURATION)
    (asserts! (<= duration MAX_DURATION) ERR_INVALID_DURATION)

    ;; v3: beneficiary cannot be the same as seller (would muddy authorization)
    ;; and cannot be the buyer themselves (redundant + confusing).
    (asserts!
      (match beneficiary
        b (and (not (is-eq b seller)) (not (is-eq b buyer)))
        true
      )
      ERR_SELF_BENEFICIARY
    )

    ;; Transfer funds from buyer to contract
    (if (is-eq token-type TOKEN_STX)
      (try! (stx-transfer? total-amount buyer current-contract))
      (try! (sbtc-deposit total-amount buyer))
    )

    ;; Create escrow record (with fee-recipient snapshot + beneficiary)
    (map-set escrows escrow-id {
      buyer: buyer,
      seller: seller,
      beneficiary: beneficiary,
      amount: amount,
      fee-amount: fee,
      fee-recipient: fee-recipient-snapshot,
      token-type: token-type,
      description: description,
      status: STATUS_PENDING,
      created-at: burn-block-height,
      expires-at: expires-at,
      completed-at: none,
      disputed-at: none,
      delivered-at: none
    })

    ;; Update global statistics + locked accounting (v3)
    (var-set total-escrows (+ (var-get total-escrows) u1))
    (add-volume token-type amount)
    (add-locked token-type total-amount)

    ;; Update buyer stats
    (map-set user-stats buyer (merge buyer-stats {
      escrows-created: (+ (get escrows-created buyer-stats) u1),
      total-sent-stx: (if (is-eq token-type TOKEN_STX)
        (+ (get total-sent-stx buyer-stats) total-amount)
        (get total-sent-stx buyer-stats)),
      total-sent-sbtc: (if (is-eq token-type TOKEN_SBTC)
        (+ (get total-sent-sbtc buyer-stats) total-amount)
        (get total-sent-sbtc buyer-stats))
    }))

    (print {
      event: "escrow-created",
      escrow-id: escrow-id,
      buyer: buyer,
      seller: seller,
      beneficiary: beneficiary,
      amount: amount,
      fee: fee,
      fee-recipient: fee-recipient-snapshot,
      token-type: token-type,
      expires-at: expires-at
    })

    (ok escrow-id)
  )
)

(define-public (deliver (escrow-id uint))
  (begin
    (asserts! (> escrow-id u0) ERR_ESCROW_NOT_FOUND)
  (let (
    (escrow (unwrap! (map-get? escrows escrow-id) ERR_ESCROW_NOT_FOUND))
    (seller (get seller escrow))
    (status (get status escrow))
  )
    (try! (check-is-operational))

    (asserts! (is-eq contract-caller seller) ERR_UNAUTHORIZED)
    (asserts! (is-eq status STATUS_PENDING) ERR_INVALID_STATUS)

    (map-set escrows escrow-id (merge escrow {
      status: STATUS_DELIVERED,
      delivered-at: (some burn-block-height)
    }))

    (print {
      event: "escrow-delivered",
      escrow-id: escrow-id,
      seller: seller,
      delivered-at: burn-block-height
    })

    (ok true)
  ))
)

(define-public (release (escrow-id uint))
  (begin
    (asserts! (> escrow-id u0) ERR_ESCROW_NOT_FOUND)
  (let (
    (escrow (unwrap! (map-get? escrows escrow-id) ERR_ESCROW_NOT_FOUND))
    (buyer (get buyer escrow))
    (seller (get seller escrow))
    (amount (get amount escrow))
    (fee (get fee-amount escrow))
    (token-type (get token-type escrow))
    (status (get status escrow))
    (per-escrow-fee-recipient (get fee-recipient escrow))
    (seller-stats (ensure-user-stats seller))
  )
    (try! (check-is-operational))

    ;; v3: buyer OR beneficiary can release
    (asserts! (is-buyer-or-beneficiary contract-caller escrow) ERR_UNAUTHORIZED)

    (asserts!
      (or (is-eq status STATUS_PENDING) (is-eq status STATUS_DELIVERED))
      ERR_ESCROW_ALREADY_COMPLETED
    )

    ;; CEI: status first, then transfers
    (map-set escrows escrow-id (merge escrow {
      status: STATUS_RELEASED,
      completed-at: (some burn-block-height)
    }))

    ;; Locked-balance decrement (v3): full amount+fee leaves the escrow row
    (sub-locked token-type (+ amount fee))

    (if (is-eq token-type TOKEN_STX)
      (try! (stx-withdraw amount seller))
      (try! (sbtc-withdraw amount seller))
    )

    ;; v3: fee goes to the escrow's snapshot recipient, not current var
    (if (> fee u0)
      (if (is-eq token-type TOKEN_STX)
        (try! (stx-withdraw fee per-escrow-fee-recipient))
        (try! (sbtc-withdraw fee per-escrow-fee-recipient))
      )
      true
    )

    (var-set total-released (+ (var-get total-released) u1))
    (add-fees token-type fee)

    (map-set user-stats seller (merge seller-stats {
      escrows-received: (+ (get escrows-received seller-stats) u1),
      total-received-stx: (if (is-eq token-type TOKEN_STX)
        (+ (get total-received-stx seller-stats) amount)
        (get total-received-stx seller-stats)),
      total-received-sbtc: (if (is-eq token-type TOKEN_SBTC)
        (+ (get total-received-sbtc seller-stats) amount)
        (get total-received-sbtc seller-stats))
    }))

    (print {
      event: "escrow-released",
      escrow-id: escrow-id,
      seller: seller,
      released-by: contract-caller,
      amount: amount,
      fee: fee,
      fee-recipient: per-escrow-fee-recipient,
      token-type: token-type
    })

    (ok true)
  ))
)

;; Refund. Auth same as v2 but extended for beneficiary:
;;   - Seller may refund voluntarily any time, PENDING or DELIVERED.
;;   - Buyer OR beneficiary may refund after expires-at AND any review window.
(define-public (refund (escrow-id uint))
  (begin
    (asserts! (> escrow-id u0) ERR_ESCROW_NOT_FOUND)
  (let (
    (escrow (unwrap! (map-get? escrows escrow-id) ERR_ESCROW_NOT_FOUND))
    (buyer (get buyer escrow))
    (seller (get seller escrow))
    (amount (get amount escrow))
    (fee (get fee-amount escrow))
    (total-amount (+ amount fee))
    (token-type (get token-type escrow))
    (status (get status escrow))
    (expires-at (get expires-at escrow))
    (delivered-at-opt (get delivered-at escrow))
  )
    (try! (check-is-operational))

    (asserts!
      (or (is-eq status STATUS_PENDING) (is-eq status STATUS_DELIVERED))
      ERR_ESCROW_ALREADY_COMPLETED
    )

    (asserts!
      (or
        (is-eq contract-caller seller)
        (and
          (is-buyer-or-beneficiary contract-caller escrow)
          (is-escrow-expired expires-at)
          (is-review-period-elapsed delivered-at-opt)
        )
      )
      ERR_UNAUTHORIZED
    )

    (map-set escrows escrow-id (merge escrow {
      status: STATUS_REFUNDED,
      completed-at: (some burn-block-height)
    }))

    (sub-locked token-type total-amount)

    (if (is-eq token-type TOKEN_STX)
      (try! (stx-withdraw total-amount buyer))
      (try! (sbtc-withdraw total-amount buyer))
    )

    (var-set total-refunded (+ (var-get total-refunded) u1))

    (print {
      event: "escrow-refunded",
      escrow-id: escrow-id,
      buyer: buyer,
      refunded-by: contract-caller,
      amount: total-amount,
      token-type: token-type
    })

    (ok true)
  ))
)

;; Dispute: buyer, beneficiary, or seller, from PENDING or DELIVERED.
(define-public (dispute (escrow-id uint))
  (begin
    (asserts! (> escrow-id u0) ERR_ESCROW_NOT_FOUND)
  (let (
    (escrow (unwrap! (map-get? escrows escrow-id) ERR_ESCROW_NOT_FOUND))
    (seller (get seller escrow))
    (status (get status escrow))
  )
    (try! (check-is-operational))

    (asserts!
      (or
        (is-buyer-or-beneficiary contract-caller escrow)
        (is-eq contract-caller seller)
      )
      ERR_UNAUTHORIZED
    )

    (asserts!
      (or (is-eq status STATUS_PENDING) (is-eq status STATUS_DELIVERED))
      ERR_ESCROW_ALREADY_COMPLETED
    )

    (map-set escrows escrow-id (merge escrow {
      status: STATUS_DISPUTED,
      disputed-at: (some burn-block-height)
    }))

    (var-set active-disputes (+ (var-get active-disputes) u1))

    (print {
      event: "escrow-disputed",
      escrow-id: escrow-id,
      disputed-by: contract-caller,
      disputed-at: burn-block-height
    })

    (ok true)
  ))
)

;; Extend (buyer or beneficiary only, PENDING only)
(define-public (extend-escrow (escrow-id uint) (additional-blocks uint))
  (begin
    (asserts! (> escrow-id u0) ERR_ESCROW_NOT_FOUND)
  (let (
    (escrow (unwrap! (map-get? escrows escrow-id) ERR_ESCROW_NOT_FOUND))
    (current-expires (get expires-at escrow))
    (new-expires (+ current-expires additional-blocks))
    (status (get status escrow))
  )
    (try! (check-is-operational))

    (asserts! (is-buyer-or-beneficiary contract-caller escrow) ERR_UNAUTHORIZED)
    (asserts! (is-eq status STATUS_PENDING) ERR_ESCROW_ALREADY_COMPLETED)
    (asserts! (not (is-escrow-expired current-expires)) ERR_ESCROW_EXPIRED)
    (asserts! (> additional-blocks u0) ERR_INVALID_EXTENSION)
    (asserts! (<= (- new-expires burn-block-height) MAX_DURATION) ERR_INVALID_EXTENSION)

    (map-set escrows escrow-id (merge escrow {
      expires-at: new-expires
    }))

    (print {
      event: "escrow-extended",
      escrow-id: escrow-id,
      old-expires-at: current-expires,
      new-expires-at: new-expires,
      extended-by: contract-caller
    })

    (ok true)
  ))
)

;; ============================================================================
;; DISPUTE RESOLUTION
;; ============================================================================

(define-public (resolve-dispute-for-buyer (escrow-id uint))
  (begin
    (asserts! (> escrow-id u0) ERR_ESCROW_NOT_FOUND)
  (let (
    (escrow (unwrap! (map-get? escrows escrow-id) ERR_ESCROW_NOT_FOUND))
    (buyer (get buyer escrow))
    (amount (get amount escrow))
    (fee (get fee-amount escrow))
    (total-amount (+ amount fee))
    (token-type (get token-type escrow))
    (status (get status escrow))
  )
    (try! (check-is-owner))
    (asserts! (is-eq status STATUS_DISPUTED) ERR_NOT_DISPUTED)

    (map-set escrows escrow-id (merge escrow {
      status: STATUS_REFUNDED,
      completed-at: (some burn-block-height)
    }))

    (sub-locked token-type total-amount)

    (if (is-eq token-type TOKEN_STX)
      (try! (stx-withdraw total-amount buyer))
      (try! (sbtc-withdraw total-amount buyer))
    )

    (var-set total-refunded (+ (var-get total-refunded) u1))
    (var-set active-disputes (- (var-get active-disputes) u1))

    (print {
      event: "dispute-resolved-for-buyer",
      escrow-id: escrow-id,
      buyer: buyer,
      amount: total-amount,
      token-type: token-type,
      resolved-by: contract-caller
    })

    (ok true)
  ))
)

(define-public (resolve-dispute-for-seller (escrow-id uint))
  (begin
    (asserts! (> escrow-id u0) ERR_ESCROW_NOT_FOUND)
  (let (
    (escrow (unwrap! (map-get? escrows escrow-id) ERR_ESCROW_NOT_FOUND))
    (seller (get seller escrow))
    (amount (get amount escrow))
    (fee (get fee-amount escrow))
    (token-type (get token-type escrow))
    (status (get status escrow))
    (per-escrow-fee-recipient (get fee-recipient escrow))
    (seller-stats (ensure-user-stats seller))
  )
    (try! (check-is-owner))
    (asserts! (is-eq status STATUS_DISPUTED) ERR_NOT_DISPUTED)

    (map-set escrows escrow-id (merge escrow {
      status: STATUS_RELEASED,
      completed-at: (some burn-block-height)
    }))

    (sub-locked token-type (+ amount fee))

    (if (is-eq token-type TOKEN_STX)
      (try! (stx-withdraw amount seller))
      (try! (sbtc-withdraw amount seller))
    )

    (if (> fee u0)
      (if (is-eq token-type TOKEN_STX)
        (try! (stx-withdraw fee per-escrow-fee-recipient))
        (try! (sbtc-withdraw fee per-escrow-fee-recipient))
      )
      true
    )

    (var-set total-released (+ (var-get total-released) u1))
    (add-fees token-type fee)
    (var-set active-disputes (- (var-get active-disputes) u1))

    (map-set user-stats seller (merge seller-stats {
      escrows-received: (+ (get escrows-received seller-stats) u1),
      total-received-stx: (if (is-eq token-type TOKEN_STX)
        (+ (get total-received-stx seller-stats) amount)
        (get total-received-stx seller-stats)),
      total-received-sbtc: (if (is-eq token-type TOKEN_SBTC)
        (+ (get total-received-sbtc seller-stats) amount)
        (get total-received-sbtc seller-stats))
    }))

    (print {
      event: "dispute-resolved-for-seller",
      escrow-id: escrow-id,
      seller: seller,
      amount: amount,
      fee: fee,
      fee-recipient: per-escrow-fee-recipient,
      token-type: token-type,
      resolved-by: contract-caller
    })

    (ok true)
  ))
)

(define-public (resolve-dispute-split (escrow-id uint) (buyer-bps uint))
  (begin
    (asserts! (> escrow-id u0) ERR_ESCROW_NOT_FOUND)
    (asserts! (<= buyer-bps BPS_DENOMINATOR) ERR_INVALID_BPS)
  (let (
    (escrow (unwrap! (map-get? escrows escrow-id) ERR_ESCROW_NOT_FOUND))
    (buyer (get buyer escrow))
    (seller (get seller escrow))
    (amount (get amount escrow))
    (fee (get fee-amount escrow))
    (token-type (get token-type escrow))
    (status (get status escrow))
    (per-escrow-fee-recipient (get fee-recipient escrow))
    (seller-stats (ensure-user-stats seller))
    (buyer-principal-share (/ (* amount buyer-bps) BPS_DENOMINATOR))
    (seller-share (- amount buyer-principal-share))
    (buyer-fee-refund (/ (* fee buyer-bps) BPS_DENOMINATOR))
    (platform-fee (- fee buyer-fee-refund))
    (buyer-payout (+ buyer-principal-share buyer-fee-refund))
  )
    (try! (check-is-owner))
    (asserts! (is-eq status STATUS_DISPUTED) ERR_NOT_DISPUTED)

    (map-set escrows escrow-id (merge escrow {
      status: STATUS_RELEASED,
      completed-at: (some burn-block-height)
    }))

    (sub-locked token-type (+ amount fee))

    (if (> buyer-payout u0)
      (if (is-eq token-type TOKEN_STX)
        (try! (stx-withdraw buyer-payout buyer))
        (try! (sbtc-withdraw buyer-payout buyer))
      )
      true
    )

    (if (> seller-share u0)
      (if (is-eq token-type TOKEN_STX)
        (try! (stx-withdraw seller-share seller))
        (try! (sbtc-withdraw seller-share seller))
      )
      true
    )

    (if (> platform-fee u0)
      (if (is-eq token-type TOKEN_STX)
        (try! (stx-withdraw platform-fee per-escrow-fee-recipient))
        (try! (sbtc-withdraw platform-fee per-escrow-fee-recipient))
      )
      true
    )

    (var-set total-released (+ (var-get total-released) u1))
    (add-fees token-type platform-fee)
    (var-set active-disputes (- (var-get active-disputes) u1))

    (if (> seller-share u0)
      (map-set user-stats seller (merge seller-stats {
        escrows-received: (+ (get escrows-received seller-stats) u1),
        total-received-stx: (if (is-eq token-type TOKEN_STX)
          (+ (get total-received-stx seller-stats) seller-share)
          (get total-received-stx seller-stats)),
        total-received-sbtc: (if (is-eq token-type TOKEN_SBTC)
          (+ (get total-received-sbtc seller-stats) seller-share)
          (get total-received-sbtc seller-stats))
      }))
      true
    )

    (print {
      event: "dispute-resolved-split",
      escrow-id: escrow-id,
      buyer: buyer,
      seller: seller,
      buyer-bps: buyer-bps,
      buyer-payout: buyer-payout,
      seller-payout: seller-share,
      platform-fee: platform-fee,
      fee-recipient: per-escrow-fee-recipient,
      token-type: token-type,
      resolved-by: contract-caller
    })

    (ok true)
  ))
)

;; Buyer (or beneficiary) self-rescue after dispute-timeout. Unchanged from v2
;; except for the buyer-or-beneficiary auth check and burn-block clock.
(define-public (resolve-expired-dispute (escrow-id uint))
  (begin
    (asserts! (> escrow-id u0) ERR_ESCROW_NOT_FOUND)
  (let (
    (escrow (unwrap! (map-get? escrows escrow-id) ERR_ESCROW_NOT_FOUND))
    (buyer (get buyer escrow))
    (amount (get amount escrow))
    (fee (get fee-amount escrow))
    (total-amount (+ amount fee))
    (token-type (get token-type escrow))
    (status (get status escrow))
    (disputed-at (unwrap! (get disputed-at escrow) ERR_NOT_DISPUTED))
  )
    (asserts! (is-eq status STATUS_DISPUTED) ERR_NOT_DISPUTED)
    (asserts! (> burn-block-height (+ disputed-at (var-get dispute-timeout))) ERR_DISPUTE_NOT_TIMED_OUT)
    (asserts! (is-buyer-or-beneficiary contract-caller escrow) ERR_UNAUTHORIZED)

    (map-set escrows escrow-id (merge escrow {
      status: STATUS_REFUNDED,
      completed-at: (some burn-block-height)
    }))

    (sub-locked token-type total-amount)

    (if (is-eq token-type TOKEN_STX)
      (try! (stx-withdraw total-amount buyer))
      (try! (sbtc-withdraw total-amount buyer))
    )

    (var-set total-refunded (+ (var-get total-refunded) u1))
    (var-set active-disputes (- (var-get active-disputes) u1))

    (print {
      event: "dispute-expired-resolved",
      escrow-id: escrow-id,
      buyer: buyer,
      resolved-by: contract-caller,
      amount: total-amount,
      token-type: token-type,
      disputed-at: disputed-at,
      resolved-at: burn-block-height
    })

    (ok true)
  ))
)

;; v3 NEW: seller self-rescue.
;;
;; If a dispute has gone past SELLER_RESCUE_MULTIPLIER x dispute-timeout
;; without admin resolution, AND the escrow was DELIVERED before the
;; dispute, the seller can claim. This closes the asymmetry where only
;; buyers had a path out of admin-absent disputes (security #7.1).
;;
;; The 2x multiplier means the buyer's own self-rescue path
;; (resolve-expired-dispute) is reachable first. This gives buyers
;; precedence in the typical case (they're the one with funds locked)
;; while still rescuing sellers from outright abandonment.
;;
;; Requires that the escrow was DELIVERED before being disputed:
;; non-delivered escrows have no proof of seller performance, so the
;; default fallback should remain refund-to-buyer.
(define-public (resolve-expired-dispute-for-seller (escrow-id uint))
  (begin
    (asserts! (> escrow-id u0) ERR_ESCROW_NOT_FOUND)
  (let (
    (escrow (unwrap! (map-get? escrows escrow-id) ERR_ESCROW_NOT_FOUND))
    (seller (get seller escrow))
    (amount (get amount escrow))
    (fee (get fee-amount escrow))
    (token-type (get token-type escrow))
    (status (get status escrow))
    (disputed-at (unwrap! (get disputed-at escrow) ERR_NOT_DISPUTED))
    (per-escrow-fee-recipient (get fee-recipient escrow))
    (seller-stats (ensure-user-stats seller))
    (seller-rescue-threshold (+ disputed-at (* (var-get dispute-timeout) SELLER_RESCUE_MULTIPLIER)))
  )
    (asserts! (is-eq status STATUS_DISPUTED) ERR_NOT_DISPUTED)
    (asserts! (is-some (get delivered-at escrow)) ERR_NOT_DELIVERED)
    (asserts! (> burn-block-height seller-rescue-threshold) ERR_DISPUTE_NOT_TIMED_OUT)
    (asserts! (is-eq contract-caller seller) ERR_UNAUTHORIZED)

    (map-set escrows escrow-id (merge escrow {
      status: STATUS_RELEASED,
      completed-at: (some burn-block-height)
    }))

    (sub-locked token-type (+ amount fee))

    (if (is-eq token-type TOKEN_STX)
      (try! (stx-withdraw amount seller))
      (try! (sbtc-withdraw amount seller))
    )

    (if (> fee u0)
      (if (is-eq token-type TOKEN_STX)
        (try! (stx-withdraw fee per-escrow-fee-recipient))
        (try! (sbtc-withdraw fee per-escrow-fee-recipient))
      )
      true
    )

    (var-set total-released (+ (var-get total-released) u1))
    (add-fees token-type fee)
    (var-set active-disputes (- (var-get active-disputes) u1))

    (map-set user-stats seller (merge seller-stats {
      escrows-received: (+ (get escrows-received seller-stats) u1),
      total-received-stx: (if (is-eq token-type TOKEN_STX)
        (+ (get total-received-stx seller-stats) amount)
        (get total-received-stx seller-stats)),
      total-received-sbtc: (if (is-eq token-type TOKEN_SBTC)
        (+ (get total-received-sbtc seller-stats) amount)
        (get total-received-sbtc seller-stats))
    }))

    (print {
      event: "dispute-expired-resolved-for-seller",
      escrow-id: escrow-id,
      seller: seller,
      amount: amount,
      fee: fee,
      token-type: token-type,
      disputed-at: disputed-at,
      resolved-at: burn-block-height
    })

    (ok true)
  ))
)

;; ============================================================================
;; READ-ONLY FUNCTIONS
;; ============================================================================

(define-read-only (get-escrow (escrow-id uint))
  (map-get? escrows escrow-id)
)

(define-read-only (get-escrow-count)
  (var-get escrow-nonce)
)

(define-read-only (escrow-exists (escrow-id uint))
  (is-some (map-get? escrows escrow-id))
)

(define-read-only (is-expired (escrow-id uint))
  (match (map-get? escrows escrow-id)
    escrow (is-escrow-expired (get expires-at escrow))
    false
  )
)

(define-read-only (get-status (escrow-id uint))
  (match (map-get? escrows escrow-id)
    escrow (ok (get status escrow))
    ERR_ESCROW_NOT_FOUND
  )
)

(define-read-only (is-in-review-period (escrow-id uint))
  (match (map-get? escrows escrow-id)
    escrow
      (match (get delivered-at escrow)
        da (<= burn-block-height (+ da REVIEW_PERIOD))
        false
      )
    false
  )
)

(define-read-only (get-user-role (escrow-id uint) (user principal))
  (match (map-get? escrows escrow-id)
    escrow (if (is-eq user (get buyer escrow))
      (ok "buyer")
      (if (is-eq user (get seller escrow))
        (ok "seller")
        (if (match (get beneficiary escrow) b (is-eq user b) false)
          (ok "beneficiary")
          (ok "none")
        )
      )
    )
    (ok "none")
  )
)

(define-read-only (get-user-stats (user principal))
  (default-to
    {
      escrows-created: u0,
      escrows-received: u0,
      total-sent-stx: u0,
      total-sent-sbtc: u0,
      total-received-stx: u0,
      total-received-sbtc: u0
    }
    (map-get? user-stats user)
  )
)

;; v3: includes total-locked-{stx,sbtc} for on-chain invariant monitoring.
(define-read-only (get-platform-stats)
  {
    total-escrows: (var-get total-escrows),
    total-volume-stx: (var-get total-volume-stx),
    total-volume-sbtc: (var-get total-volume-sbtc),
    total-fees-collected-stx: (var-get total-fees-collected-stx),
    total-fees-collected-sbtc: (var-get total-fees-collected-sbtc),
    total-released: (var-get total-released),
    total-refunded: (var-get total-refunded),
    active-disputes: (var-get active-disputes),
    total-locked-stx: (var-get total-locked-stx),
    total-locked-sbtc: (var-get total-locked-sbtc)
  }
)

;; v3: live contract balances for invariant monitoring.
(define-read-only (get-contract-balance)
  {
    stx-balance: (stx-get-balance current-contract),
    sbtc-balance: (unwrap-panic (contract-call? 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token get-balance current-contract)),
    locked-stx: (var-get total-locked-stx),
    locked-sbtc: (var-get total-locked-sbtc),
    free-stx: (if (>= (stx-get-balance current-contract) (var-get total-locked-stx))
      (- (stx-get-balance current-contract) (var-get total-locked-stx))
      u0
    ),
    free-sbtc: u0  ;; computed off-chain to avoid double sbtc-token call cost
  }
)

(define-read-only (get-config)
  {
    owner: (var-get contract-owner),
    fee-recipient: (var-get fee-recipient),
    platform-fee-bps: (var-get platform-fee-bps),
    is-paused: (var-get contract-paused),
    pause-until-block: (var-get pause-until-block),
    pause-cooldown-until: (var-get pause-cooldown-until),
    is-operational: (is-operational),
    min-amount-stx: MIN_AMOUNT_STX,
    max-amount-stx: MAX_AMOUNT_STX,
    min-amount-sbtc: MIN_AMOUNT_SBTC,
    max-amount-sbtc: MAX_AMOUNT_SBTC,
    min-duration: MIN_DURATION,
    max-duration: MAX_DURATION,
    dispute-timeout: (var-get dispute-timeout),
    review-period: REVIEW_PERIOD,
    max-pause-duration: MAX_PAUSE_DURATION,
    seller-rescue-multiplier: SELLER_RESCUE_MULTIPLIER
  }
)

(define-read-only (is-paused)
  (not (is-operational))
)

(define-read-only (calculate-escrow-fee (amount uint))
  (calculate-fee amount)
)

(define-read-only (is-dispute-timed-out (escrow-id uint))
  (match (map-get? escrows escrow-id)
    escrow
      (match (get disputed-at escrow)
        da (> burn-block-height (+ da (var-get dispute-timeout)))
        false
      )
    false
  )
)

;; v3 NEW: true when the seller-self-rescue window has elapsed for this escrow.
(define-read-only (is-seller-rescue-eligible (escrow-id uint))
  (match (map-get? escrows escrow-id)
    escrow
      (and
        (is-eq (get status escrow) STATUS_DISPUTED)
        (is-some (get delivered-at escrow))
        (match (get disputed-at escrow)
          da (> burn-block-height (+ da (* (var-get dispute-timeout) SELLER_RESCUE_MULTIPLIER)))
          false
        )
      )
    false
  )
)
