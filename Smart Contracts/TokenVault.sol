// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

/**
 * TokenVault V2 (Final for testnet)
 *
 * - Maintains storage layout of V1 (token, roles, nonce, __gap)
 * - Disables legacy lock() and release() (revert) to force V2 usage (safe for testnet)
 * - Adds lockTo(...) and releaseV2(...) with deterministic transferID (abi.encode)
 * - processedRelease mapping to prevent double-release
 * - initializeV2() reinitializer for upgrade
 *
 * Note: After upgrading implementation on proxy, call initializeV2() once.
 */
contract TokenVault_old is Initializable, ReentrancyGuardUpgradeable, AccessControlUpgradeable, PausableUpgradeable {
    using SafeERC20Upgradeable for IERC20Upgradeable;

    /* =========================
       Storage (V1 layout preserved)
       ========================= */
    IERC20Upgradeable public token; // token to lock (MRT)
    bytes32 public constant VAULT_OPERATOR_ROLE = keccak256("VAULT_OPERATOR_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");

    uint64 public nonce; // compact nonce for transferID

    // Legacy events (keep signatures for ABI compatibility)
    event TokensLocked(
        address indexed user,
        address indexed toChainRecipient,
        uint256 amount,
        uint64 nonce,
        bytes32 transferID
    );
    event TokensReleased(
        address indexed to,
        uint256 amount,
        bytes32 transferID
    );

    /* =========================
       New storage (V2) - placed AFTER V1 storage
       ========================= */
    // protects against double-release
    mapping(bytes32 => bool) public processedRelease;

    // optional version marker
    uint256 public vaultVersion;

    /* =========================
       New events (V2 / audit)
       ========================= */
    event TokensLockedV2(
        address indexed user,
        address indexed destinationWrappedToken,
        address toChainRecipient,
        uint256 amount,
        uint64 nonce,
        uint256 destinationChainId,
        bytes32 transferID
    );

    event TokensReleasedV2(
        address indexed to,
        uint256 amount,
        uint256 sourceChainId,
        bytes32 transferID
    );

    event EmergencyWithdraw(address indexed token, address indexed to, uint256 amount, address indexed admin);
    event ProcessedMarked(bytes32 indexed transferID, address indexed admin);

    /* =========================
       Adjusted storage gap
       Original gap: uint256[45]
       Added: mapping + uint256 => 2 slots
       New gap = 45 - 2 = 43
       ========================= */
    uint256[43] private __gap;

    /* =========================
       Initializers
       ========================= */

    /**
     * @notice Initialize V1-compatible state
     * @param _token main token (MRT) address (non-zero)
     * @param admin admin address (use multisig in production)
     */
    function initialize(IERC20Upgradeable _token, address admin) external initializer {
        __ReentrancyGuard_init();
        __AccessControl_init();
        __Pausable_init();

        require(address(_token) != address(0), "zero token");
        require(admin != address(0), "zero admin");

        token = _token;

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(VAULT_OPERATOR_ROLE, admin);
        _grantRole(PAUSER_ROLE, admin);

        // start nonce at 2 for backward compatibility with V1 logs
        nonce = 2;
    }

    /**
     * @notice Reinitializer for V2. Call this once after upgrade (if needed).
     */
    function initializeV2() external reinitializer(2) {
        vaultVersion = 2;
    }

    /* =========================
       Pause controls
       ========================= */
    function pause() external onlyRole(PAUSER_ROLE) { _pause(); }
    function unpause() external onlyRole(PAUSER_ROLE) { _unpause(); }

    /* =========================
       Legacy functions - DISABLED
       These keep ABI but always revert to force V2 usage (safe for testnet upgrade)
       ========================= */

    /**
     * @notice Legacy lock disabled in V2. Use lockTo(...) instead.
     */
    function lock(address /* toChainRecipient */, uint256 /* amount */) external pure {
        revert("LOCK_V1_DISABLED");
    }

    /**
     * @notice Legacy release disabled in V2. Use releaseV2(...) instead.
     */
    function release(address /* to */, uint256 /* amount */, bytes32 /* transferID */) external pure {
        revert("RELEASE_V1_DISABLED");
    }

    /* =========================
       V2: Lock with destination info
       ========================= */

    /**
     * @notice Lock main token for cross-chain transfer (V2).
     * @param toChainRecipient recipient address on destination chain
     * @param amount amount to lock
     * @param destinationChainId numeric chain id of destination chain
     * @param destinationWrappedToken wrapped token address on destination chain (for relayers)
     */
    function lockTo(
        address toChainRecipient,
        uint256 amount,
        uint256 destinationChainId,
        address destinationWrappedToken
    )
        external
        nonReentrant
        whenNotPaused
    {
        require(amount > 0, "zero amount");
        require(toChainRecipient != address(0), "zero recipient");
        require(destinationWrappedToken != address(0), "zero dst wrapped");

        // Transfer main token to vault
        token.safeTransferFrom(msg.sender, address(this), amount);

        // Deterministic transferID (no timestamp) using abi.encode
        bytes32 transferID = keccak256(
            abi.encode(msg.sender, toChainRecipient, amount, nonce, block.chainid, destinationChainId, destinationWrappedToken)
        );

        // Emit legacy event for compatibility (keeps old index layout)
        emit TokensLocked(msg.sender, toChainRecipient, amount, nonce, transferID);

        // Emit V2 richer event for relayers
        emit TokensLockedV2(msg.sender, destinationWrappedToken, toChainRecipient, amount, nonce, destinationChainId, transferID);

        unchecked { nonce += 1; }
    }

    /* =========================
       V2: Release (safe, idempotent)
       ========================= */

    /**
     * @notice Release main token to recipient on this chain. Only VAULT_OPERATOR_ROLE.
     * @param to recipient address on main chain
     * @param amount amount to release
     * @param sourceChainId chain id where burn occurred (for metadata)
     * @param transferID deterministic transfer id matching burn/mint flow
     */
    function releaseV2(
        address to,
        uint256 amount,
        uint256 sourceChainId,
        bytes32 transferID
    )
        external
        onlyRole(VAULT_OPERATOR_ROLE)
        nonReentrant
    {
        require(amount > 0, "zero amount");
        require(to != address(0), "zero address");
        require(!processedRelease[transferID], "already released");

        processedRelease[transferID] = true;

        token.safeTransfer(to, amount);

        // Emit events for legacy compatibility and richer metadata
        emit TokensReleased(to, amount, transferID);
        emit TokensReleasedV2(to, amount, sourceChainId, transferID);
    }

    /* =========================
       Admin / Operator helpers
       ========================= */

    /**
     * @notice Emergency withdraw tokens from vault (admin only). Use multisig in production.
     * @param tokenAddr token to withdraw
     * @param to recipient of the withdrawn tokens
     * @param amount amount to withdraw
     */
    function emergencyWithdraw(address tokenAddr, address to, uint256 amount) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(to != address(0), "zero to");
        require(amount > 0, "zero amount");
        IERC20Upgradeable(tokenAddr).safeTransfer(to, amount);
        emit EmergencyWithdraw(tokenAddr, to, amount, msg.sender);
    }

    /**
     * @notice Mark a transferID as processed manually (for recovery). Admin only.
     * @param transferID transfer id to mark processed
     */
    function markProcessed(bytes32 transferID) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(transferID != bytes32(0), "zero id");
        processedRelease[transferID] = true;
        emit ProcessedMarked(transferID, msg.sender);
    }

    /**
     * @notice View whether transferID already processed (released).
     * @param transferID id to check
     */
    function isProcessed(bytes32 transferID) external view returns (bool) {
        return processedRelease[transferID];
    }
}
