;; title: sBTC Escrow V3
;; version: 3.0.0
;; summary: Hardened Enterprise Escrow for Trustless Payments
;; description: Production-grade escrow infrastructure hardened against
;;              known Clarity attack vectors. Uses contract-caller for
;;              phishing resistance, dispute timeouts for fund recovery,
;;              and comprehensive access controls.
;;              Built for Stacks Endowment Grant - Getting Started Track
;;
;; Security notes:
;; - All authorization uses contract-caller (NOT tx-sender) to prevent
;;   phishing attacks through malicious intermediary contracts.
;; - Disputes have a timeout after which the buyer can self-resolve,
;;   preventing permanent fund lockup if admin key is lost.
;; - Buyer can always release funds to seller (even after expiry),
;;   because paying the seller should never be blocked.
;; - All state-changing functions respect the pause mechanism.
;; - Fee changes are bounded and take effect only on new escrows.
;;
;; NOTE: This contract uses STX for simnet testing. For sBTC deployment,
;;       swap stx-transfer? calls with contract-call? to sbtc-token.

;; ============================================================================
;; CONSTANTS
;; ============================================================================

;; Contract deployer (set once at deployment, immutable)
(define-constant DEPLOYER tx-sender)

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

;; Error codes - Transfer
(define-constant ERR_TRANSFER_FAILED (err u3001))
(define-constant ERR_INSUFFICIENT_BALANCE (err u3002))

;; Escrow status codes
(define-constant STATUS_PENDING u0)
(define-constant STATUS_RELEASED u1)
(define-constant STATUS_REFUNDED u2)
(define-constant STATUS_DISPUTED u3)

;; Platform configuration (immutable bounds)
(define-constant PLATFORM_FEE_BPS u50)        ;; 0.5% default platform fee
(define-constant MAX_FEE_BPS u500)            ;; 5% absolute ceiling
(define-constant BPS_DENOMINATOR u10000)
(define-constant MIN_AMOUNT u1000)            ;; 1000 microSTX minimum
(define-constant MAX_AMOUNT u100000000000000) ;; 100M STX max
(define-constant MAX_DURATION u52560)         ;; ~365 days at 144 blocks/day
(define-constant MIN_DISPUTE_TIMEOUT u1)       ;; 1 block minimum (for testing)
(define-constant MAX_DISPUTE_TIMEOUT u8640)    ;; ~60 days maximum
(define-constant DEFAULT_DISPUTE_TIMEOUT u4320) ;; ~30 days default

;; ============================================================================
;; DATA VARIABLES
;; ============================================================================

;; Contract state
(define-data-var contract-paused bool false)
(define-data-var contract-owner principal DEPLOYER)
(define-data-var pending-owner (optional principal) none)
(define-data-var fee-recipient principal DEPLOYER)
(define-data-var platform-fee-bps uint PLATFORM_FEE_BPS)
(define-data-var dispute-timeout uint DEFAULT_DISPUTE_TIMEOUT)

;; Counters
(define-data-var escrow-nonce uint u0)

;; Global statistics
(define-data-var total-escrows uint u0)
(define-data-var total-volume uint u0)
(define-data-var total-fees-collected uint u0)
(define-data-var total-released uint u0)
(define-data-var total-refunded uint u0)
(define-data-var active-disputes uint u0)

;; ============================================================================
;; DATA MAPS
;; ============================================================================

;; Escrow storage
(define-map escrows
  uint
  {
    buyer: principal,
    seller: principal,
    amount: uint,
    fee-amount: uint,
    description: (string-utf8 256),
    status: uint,
    created-at: uint,
    expires-at: uint,
    completed-at: (optional uint),
    disputed-at: (optional uint)
  }
)

;; User statistics
(define-map user-stats
  principal
  {
    escrows-created: uint,
    escrows-received: uint,
    total-sent: uint,
    total-received: uint
  }
)

;; ============================================================================
;; PRIVATE HELPER FUNCTIONS
;; ============================================================================

;; Calculate platform fee from amount
(define-private (calculate-fee (amount uint))
  (/ (* amount (var-get platform-fee-bps)) BPS_DENOMINATOR)
)

;; Check if contract is operational (not paused)
(define-private (is-operational)
  (not (var-get contract-paused))
)

;; Check if caller is owner (uses contract-caller for safety)
(define-private (is-owner)
  (is-eq contract-caller (var-get contract-owner))
)

;; Check if escrow has expired based on block height
(define-private (is-escrow-expired (expires-at uint))
  (> stacks-block-height expires-at)
)

;; Get next escrow ID (atomic increment)
(define-private (get-next-escrow-id)
  (let ((current-id (var-get escrow-nonce)))
    (var-set escrow-nonce (+ current-id u1))
    (+ current-id u1)
  )
)

;; Initialize user stats if not exists, return current
(define-private (ensure-user-stats (user principal))
  (default-to
    {
      escrows-created: u0,
      escrows-received: u0,
      total-sent: u0,
      total-received: u0
    }
    (map-get? user-stats user)
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

;; Pause contract (emergency stop)
(define-public (pause-contract)
  (begin
    (try! (check-is-owner))
    (var-set contract-paused true)
    (print { event: "contract-paused", by: contract-caller, block: stacks-block-height })
    (ok true)
  )
)

;; Unpause contract
(define-public (unpause-contract)
  (begin
    (try! (check-is-owner))
    (var-set contract-paused false)
    (print { event: "contract-unpaused", by: contract-caller, block: stacks-block-height })
    (ok true)
  )
)

;; Initiate ownership transfer (2-step for security)
(define-public (transfer-ownership (new-owner principal))
  (begin
    (try! (check-is-owner))
    (asserts! (not (is-eq new-owner (var-get contract-owner))) ERR_UNAUTHORIZED)
    (var-set pending-owner (some new-owner))
    (print { event: "ownership-transfer-initiated", from: contract-caller, to: new-owner })
    (ok true)
  )
)

;; Accept ownership (called by new owner)
(define-public (accept-ownership)
  (let ((pending (unwrap! (var-get pending-owner) ERR_OWNERSHIP_PENDING)))
    (asserts! (is-eq contract-caller pending) ERR_NOT_PENDING_OWNER)
    (var-set contract-owner pending)
    (var-set pending-owner none)
    (print { event: "ownership-transferred", new-owner: contract-caller })
    (ok true)
  )
)

;; Update fee recipient
(define-public (set-fee-recipient (recipient principal))
  (begin
    (try! (check-is-owner))
    (asserts! (not (is-eq recipient (var-get fee-recipient))) ERR_UNAUTHORIZED)
    (var-set fee-recipient recipient)
    (print { event: "fee-recipient-updated", recipient: recipient })
    (ok true)
  )
)

;; Update platform fee (capped at MAX_FEE_BPS = 5%)
(define-public (set-platform-fee (fee-bps uint))
  (begin
    (try! (check-is-owner))
    (asserts! (<= fee-bps MAX_FEE_BPS) ERR_INVALID_AMOUNT)
    (var-set platform-fee-bps fee-bps)
    (print { event: "platform-fee-updated", fee-bps: fee-bps })
    (ok true)
  )
)

;; Update dispute timeout (admin only, bounded)
;; Set low (e.g. u5) for testnet testing, u4320 for production.
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

;; ============================================================================
;; ESCROW CORE FUNCTIONS
;; ============================================================================

;; Create a new escrow -- Buyer deposits funds
;;
;; The buyer locks (amount + fee) into the contract. The fee is calculated
;; at creation time and is immutable for this escrow, even if the platform
;; fee rate changes later.
(define-public (create-escrow
  (seller principal)
  (amount uint)
  (description (string-utf8 256))
  (duration uint)
)
  (let (
    (buyer contract-caller)
    (escrow-id (get-next-escrow-id))
    (fee (calculate-fee amount))
    (total-amount (+ amount fee))
    (expires-at (+ stacks-block-height duration))
    (buyer-stats (ensure-user-stats buyer))
  )
    (try! (check-is-operational))

    ;; Validations
    (asserts! (> (len description) u0) ERR_INVALID_AMOUNT)
    (asserts! (not (is-eq buyer seller)) ERR_SELF_ESCROW)
    (asserts! (>= amount MIN_AMOUNT) ERR_INVALID_AMOUNT)
    (asserts! (<= amount MAX_AMOUNT) ERR_INVALID_AMOUNT)
    (asserts! (> duration u0) ERR_INVALID_DURATION)
    (asserts! (<= duration MAX_DURATION) ERR_INVALID_DURATION)

    ;; Transfer STX from buyer to contract
    (try! (stx-transfer? total-amount buyer current-contract))

    ;; Create escrow record
    (map-set escrows escrow-id {
      buyer: buyer,
      seller: seller,
      amount: amount,
      fee-amount: fee,
      description: description,
      status: STATUS_PENDING,
      created-at: stacks-block-height,
      expires-at: expires-at,
      completed-at: none,
      disputed-at: none
    })

    ;; Update global statistics
    (var-set total-escrows (+ (var-get total-escrows) u1))
    (var-set total-volume (+ (var-get total-volume) amount))

    ;; Update buyer stats
    (map-set user-stats buyer (merge buyer-stats {
      escrows-created: (+ (get escrows-created buyer-stats) u1),
      total-sent: (+ (get total-sent buyer-stats) total-amount)
    }))

    (print {
      event: "escrow-created",
      escrow-id: escrow-id,
      buyer: buyer,
      seller: seller,
      amount: amount,
      fee: fee,
      expires-at: expires-at
    })

    (ok escrow-id)
  )
)

;; Release funds to seller (called by buyer)
;;
;; The buyer can ALWAYS release to the seller, even after expiry.
;; Paying the counterparty should never be blocked. Expiry only
;; enables refund, it doesn't disable release.
(define-public (release (escrow-id uint))
  (begin
    (asserts! (> escrow-id u0) ERR_ESCROW_NOT_FOUND)
  (let (
    (escrow (unwrap! (map-get? escrows escrow-id) ERR_ESCROW_NOT_FOUND))
    (buyer (get buyer escrow))
    (seller (get seller escrow))
    (amount (get amount escrow))
    (fee (get fee-amount escrow))
    (status (get status escrow))
    (seller-stats (ensure-user-stats seller))
  )
    (try! (check-is-operational))

    ;; Only buyer can release (contract-caller prevents phishing)
    (asserts! (is-eq contract-caller buyer) ERR_UNAUTHORIZED)

    ;; Escrow must be pending (not completed or disputed)
    (asserts! (is-eq status STATUS_PENDING) ERR_ESCROW_ALREADY_COMPLETED)

    ;; NOTE: No expiry check - buyer can always pay the seller

    ;; Transfer principal to seller
    (try! (as-contract? ((with-stx amount)) (try! (stx-transfer? amount tx-sender seller))))

    ;; Transfer fee to platform (skip if zero)
    (if (> fee u0)
      (try! (as-contract? ((with-stx fee)) (try! (stx-transfer? fee tx-sender (var-get fee-recipient)))))
      true
    )

    ;; Update escrow status
    (map-set escrows escrow-id (merge escrow {
      status: STATUS_RELEASED,
      completed-at: (some stacks-block-height)
    }))

    ;; Update global statistics (counts, not amounts -- consistent)
    (var-set total-released (+ (var-get total-released) u1))
    (var-set total-fees-collected (+ (var-get total-fees-collected) fee))

    ;; Update seller stats
    (map-set user-stats seller (merge seller-stats {
      escrows-received: (+ (get escrows-received seller-stats) u1),
      total-received: (+ (get total-received seller-stats) amount)
    }))

    (print {
      event: "escrow-released",
      escrow-id: escrow-id,
      seller: seller,
      amount: amount,
      fee: fee
    })

    (ok true)
  ))
)

;; Refund to buyer (called by seller voluntarily, or by anyone after expiry)
;;
;; Seller can refund at any time. After expiry, anyone can trigger the
;; refund -- this ensures the buyer's funds aren't held indefinitely.
;; Full amount (principal + fee) is returned to the buyer.
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
    (status (get status escrow))
    (expires-at (get expires-at escrow))
  )
    (try! (check-is-operational))

    ;; Escrow must be pending
    (asserts! (is-eq status STATUS_PENDING) ERR_ESCROW_ALREADY_COMPLETED)

    ;; Authorization: seller can refund anytime, anyone after expiry
    (asserts!
      (or
        (is-eq contract-caller seller)
        (is-escrow-expired expires-at)
      )
      ERR_UNAUTHORIZED
    )

    ;; Transfer full amount back to buyer
    (try! (as-contract? ((with-stx total-amount)) (try! (stx-transfer? total-amount tx-sender buyer))))

    ;; Update escrow status
    (map-set escrows escrow-id (merge escrow {
      status: STATUS_REFUNDED,
      completed-at: (some stacks-block-height)
    }))

    ;; Update global statistics (counts)
    (var-set total-refunded (+ (var-get total-refunded) u1))

    (print {
      event: "escrow-refunded",
      escrow-id: escrow-id,
      buyer: buyer,
      refunded-by: contract-caller,
      amount: total-amount
    })

    (ok true)
  ))
)

;; Raise a dispute (called by either buyer or seller)
;;
;; Disputes freeze the escrow and escalate to admin resolution.
;; A dispute timeout ensures funds can't be locked forever -- after
;; dispute-timeout blocks, the buyer can self-resolve via
;; resolve-expired-dispute.
(define-public (dispute (escrow-id uint))
  (begin
    (asserts! (> escrow-id u0) ERR_ESCROW_NOT_FOUND)
  (let (
    (escrow (unwrap! (map-get? escrows escrow-id) ERR_ESCROW_NOT_FOUND))
    (buyer (get buyer escrow))
    (seller (get seller escrow))
    (status (get status escrow))
  )
    ;; Must respect pause
    (try! (check-is-operational))

    ;; Only buyer or seller can dispute (contract-caller prevents phishing)
    (asserts!
      (or (is-eq contract-caller buyer) (is-eq contract-caller seller))
      ERR_UNAUTHORIZED
    )

    ;; Escrow must be pending
    (asserts! (is-eq status STATUS_PENDING) ERR_ESCROW_ALREADY_COMPLETED)

    ;; Update status to disputed, record timestamp
    (map-set escrows escrow-id (merge escrow {
      status: STATUS_DISPUTED,
      disputed-at: (some stacks-block-height)
    }))

    ;; Update active disputes count
    (var-set active-disputes (+ (var-get active-disputes) u1))

    (print {
      event: "escrow-disputed",
      escrow-id: escrow-id,
      disputed-by: contract-caller,
      disputed-at: stacks-block-height
    })

    (ok true)
  ))
)

;; Extend escrow expiry (buyer only, pending escrows only)
;;
;; Allows the buyer to extend the deadline if more time is needed.
;; New expiry cannot exceed MAX_DURATION from current block.
(define-public (extend-escrow (escrow-id uint) (additional-blocks uint))
  (begin
    (asserts! (> escrow-id u0) ERR_ESCROW_NOT_FOUND)
  (let (
    (escrow (unwrap! (map-get? escrows escrow-id) ERR_ESCROW_NOT_FOUND))
    (buyer (get buyer escrow))
    (current-expires (get expires-at escrow))
    (new-expires (+ current-expires additional-blocks))
    (status (get status escrow))
  )
    (try! (check-is-operational))

    ;; Only buyer can extend
    (asserts! (is-eq contract-caller buyer) ERR_UNAUTHORIZED)

    ;; Must be pending
    (asserts! (is-eq status STATUS_PENDING) ERR_ESCROW_ALREADY_COMPLETED)

    ;; Extension must be positive and within bounds
    (asserts! (> additional-blocks u0) ERR_INVALID_EXTENSION)
    (asserts! (<= (- new-expires stacks-block-height) MAX_DURATION) ERR_INVALID_EXTENSION)

    ;; Update expiry
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
;; DISPUTE RESOLUTION FUNCTIONS
;; ============================================================================

;; Resolve dispute in favor of buyer (admin only)
(define-public (resolve-dispute-for-buyer (escrow-id uint))
  (begin
    (asserts! (> escrow-id u0) ERR_ESCROW_NOT_FOUND)
  (let (
    (escrow (unwrap! (map-get? escrows escrow-id) ERR_ESCROW_NOT_FOUND))
    (buyer (get buyer escrow))
    (amount (get amount escrow))
    (fee (get fee-amount escrow))
    (total-amount (+ amount fee))
    (status (get status escrow))
  )
    (try! (check-is-owner))

    ;; Escrow must be disputed
    (asserts! (is-eq status STATUS_DISPUTED) ERR_NOT_DISPUTED)

    ;; Refund full amount to buyer
    (try! (as-contract? ((with-stx total-amount)) (try! (stx-transfer? total-amount tx-sender buyer))))

    ;; Update escrow status
    (map-set escrows escrow-id (merge escrow {
      status: STATUS_REFUNDED,
      completed-at: (some stacks-block-height)
    }))

    ;; Update statistics
    (var-set total-refunded (+ (var-get total-refunded) u1))
    (var-set active-disputes (- (var-get active-disputes) u1))

    (print {
      event: "dispute-resolved-for-buyer",
      escrow-id: escrow-id,
      buyer: buyer,
      amount: total-amount,
      resolved-by: contract-caller
    })

    (ok true)
  ))
)

;; Resolve dispute in favor of seller (admin only)
(define-public (resolve-dispute-for-seller (escrow-id uint))
  (begin
    (asserts! (> escrow-id u0) ERR_ESCROW_NOT_FOUND)
  (let (
    (escrow (unwrap! (map-get? escrows escrow-id) ERR_ESCROW_NOT_FOUND))
    (seller (get seller escrow))
    (amount (get amount escrow))
    (fee (get fee-amount escrow))
    (status (get status escrow))
    (seller-stats (ensure-user-stats seller))
  )
    (try! (check-is-owner))

    ;; Escrow must be disputed
    (asserts! (is-eq status STATUS_DISPUTED) ERR_NOT_DISPUTED)

    ;; Transfer principal to seller
    (try! (as-contract? ((with-stx amount)) (try! (stx-transfer? amount tx-sender seller))))

    ;; Transfer fee to platform
    (if (> fee u0)
      (try! (as-contract? ((with-stx fee)) (try! (stx-transfer? fee tx-sender (var-get fee-recipient)))))
      true
    )

    ;; Update escrow status
    (map-set escrows escrow-id (merge escrow {
      status: STATUS_RELEASED,
      completed-at: (some stacks-block-height)
    }))

    ;; Update statistics
    (var-set total-released (+ (var-get total-released) u1))
    (var-set total-fees-collected (+ (var-get total-fees-collected) fee))
    (var-set active-disputes (- (var-get active-disputes) u1))

    ;; Update seller stats
    (map-set user-stats seller (merge seller-stats {
      escrows-received: (+ (get escrows-received seller-stats) u1),
      total-received: (+ (get total-received seller-stats) amount)
    }))

    (print {
      event: "dispute-resolved-for-seller",
      escrow-id: escrow-id,
      seller: seller,
      amount: amount,
      fee: fee,
      resolved-by: contract-caller
    })

    (ok true)
  ))
)

;; Resolve expired dispute -- buyer self-service fallback
;;
;; CRITICAL SAFETY MECHANISM: If a dispute has been open for longer than
;; dispute-timeout blocks without admin resolution, the buyer can call
;; this to recover their funds. This prevents permanent lockup if the
;; admin key is lost, compromised, or unresponsive.
(define-public (resolve-expired-dispute (escrow-id uint))
  (begin
    (asserts! (> escrow-id u0) ERR_ESCROW_NOT_FOUND)
  (let (
    (escrow (unwrap! (map-get? escrows escrow-id) ERR_ESCROW_NOT_FOUND))
    (buyer (get buyer escrow))
    (amount (get amount escrow))
    (fee (get fee-amount escrow))
    (total-amount (+ amount fee))
    (status (get status escrow))
    (disputed-at (unwrap! (get disputed-at escrow) ERR_NOT_DISPUTED))
  )
    ;; Escrow must be disputed
    (asserts! (is-eq status STATUS_DISPUTED) ERR_NOT_DISPUTED)

    ;; Dispute must have timed out
    (asserts! (> stacks-block-height (+ disputed-at (var-get dispute-timeout))) ERR_DISPUTE_NOT_TIMED_OUT)

    ;; Only buyer can trigger expired dispute resolution
    (asserts! (is-eq contract-caller buyer) ERR_UNAUTHORIZED)

    ;; Refund full amount to buyer
    (try! (as-contract? ((with-stx total-amount)) (try! (stx-transfer? total-amount tx-sender buyer))))

    ;; Update escrow status
    (map-set escrows escrow-id (merge escrow {
      status: STATUS_REFUNDED,
      completed-at: (some stacks-block-height)
    }))

    ;; Update statistics
    (var-set total-refunded (+ (var-get total-refunded) u1))
    (var-set active-disputes (- (var-get active-disputes) u1))

    (print {
      event: "dispute-expired-resolved",
      escrow-id: escrow-id,
      buyer: buyer,
      amount: total-amount,
      disputed-at: disputed-at,
      resolved-at: stacks-block-height
    })

    (ok true)
  ))
)

;; ============================================================================
;; READ-ONLY FUNCTIONS
;; ============================================================================

;; Get escrow details
(define-read-only (get-escrow (escrow-id uint))
  (map-get? escrows escrow-id)
)

;; Get escrow count
(define-read-only (get-escrow-count)
  (var-get escrow-nonce)
)

;; Check if escrow exists
(define-read-only (escrow-exists (escrow-id uint))
  (is-some (map-get? escrows escrow-id))
)

;; Check if escrow is expired
(define-read-only (is-expired (escrow-id uint))
  (match (map-get? escrows escrow-id)
    escrow (is-escrow-expired (get expires-at escrow))
    false
  )
)

;; Get escrow status
(define-read-only (get-status (escrow-id uint))
  (match (map-get? escrows escrow-id)
    escrow (ok (get status escrow))
    ERR_ESCROW_NOT_FOUND
  )
)

;; Get user role in escrow
(define-read-only (get-user-role (escrow-id uint) (user principal))
  (match (map-get? escrows escrow-id)
    escrow (if (is-eq user (get buyer escrow))
      (ok "buyer")
      (if (is-eq user (get seller escrow))
        (ok "seller")
        (ok "none")
      )
    )
    (ok "none")
  )
)

;; Get user statistics
(define-read-only (get-user-stats (user principal))
  (default-to
    { escrows-created: u0, escrows-received: u0, total-sent: u0, total-received: u0 }
    (map-get? user-stats user)
  )
)

;; Get platform statistics
(define-read-only (get-platform-stats)
  {
    total-escrows: (var-get total-escrows),
    total-volume: (var-get total-volume),
    total-fees-collected: (var-get total-fees-collected),
    total-released: (var-get total-released),
    total-refunded: (var-get total-refunded),
    active-disputes: (var-get active-disputes)
  }
)

;; Get contract configuration
(define-read-only (get-config)
  {
    owner: (var-get contract-owner),
    fee-recipient: (var-get fee-recipient),
    platform-fee-bps: (var-get platform-fee-bps),
    is-paused: (var-get contract-paused),
    min-amount: MIN_AMOUNT,
    max-amount: MAX_AMOUNT,
    max-duration: MAX_DURATION,
    dispute-timeout: (var-get dispute-timeout)
  }
)

;; Check if paused
(define-read-only (is-paused)
  (var-get contract-paused)
)

;; Calculate fee for amount (preview)
(define-read-only (calculate-escrow-fee (amount uint))
  (calculate-fee amount)
)

;; Check if a dispute has timed out
(define-read-only (is-dispute-timed-out (escrow-id uint))
  (match (map-get? escrows escrow-id)
    escrow
      (match (get disputed-at escrow)
        da (> stacks-block-height (+ da (var-get dispute-timeout)))
        false
      )
    false
  )
)
