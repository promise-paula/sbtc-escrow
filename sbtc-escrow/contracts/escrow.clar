;; title: sBTC Escrow V2
;; version: 2.0.0
;; summary: Enterprise Escrow for Trustless Payments
;; description: Production-ready escrow infrastructure with platform fees,
;;              admin controls, and comprehensive statistics.
;;              Built for Stacks Endowment Grant - Getting Started Track
;;
;; NOTE: This contract uses STX for simnet testing. For sBTC deployment,
;;       swap stx-transfer? calls with contract-call? to sbtc-token.

;; ============================================================================
;; CONSTANTS
;; ============================================================================

;; Contract deployer
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

;; Error codes - Transfer
(define-constant ERR_TRANSFER_FAILED (err u3001))
(define-constant ERR_INSUFFICIENT_BALANCE (err u3002))

;; Escrow status codes
(define-constant STATUS_PENDING u0)
(define-constant STATUS_RELEASED u1)
(define-constant STATUS_REFUNDED u2)
(define-constant STATUS_DISPUTED u3)

;; Platform configuration
(define-constant PLATFORM_FEE_BPS u50)        ;; 0.5% platform fee
(define-constant BPS_DENOMINATOR u10000)
(define-constant MIN_AMOUNT u1000)            ;; 1000 microSTX minimum
(define-constant MAX_AMOUNT u100000000000000) ;; 100M STX max
(define-constant MAX_DURATION u52560)         ;; ~1 year max duration

;; ============================================================================
;; DATA VARIABLES
;; ============================================================================

;; Contract state
(define-data-var contract-paused bool false)
(define-data-var contract-owner principal DEPLOYER)
(define-data-var pending-owner (optional principal) none)
(define-data-var fee-recipient principal DEPLOYER)
(define-data-var platform-fee-bps uint PLATFORM_FEE_BPS)

;; Counters
(define-data-var escrow-nonce uint u0)

;; Global statistics
(define-data-var total-escrows uint u0)
(define-data-var total-volume uint u0)
(define-data-var total-fees-collected uint u0)
(define-data-var total-released uint u0)
(define-data-var total-refunded uint u0)
(define-data-var total-disputed uint u0)