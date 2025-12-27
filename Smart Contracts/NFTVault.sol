// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC721/utils/ERC721HolderUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC721/IERC721Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

interface IERC721MetadataUpgradeable {
    function name() external view returns (string memory);
    function symbol() external view returns (string memory);
    function tokenURI(uint256 tokenId) external view returns (string memory);
}


/**
 * @title NFTVault (Upgradeable)
 * @notice Menyimpan NFT dari chain asal (L1) sebelum dikirim ke chain tujuan (L2)
 */
contract NFTVault is
    Initializable,
    AccessControlUpgradeable,
    ReentrancyGuardUpgradeable,
    PausableUpgradeable,
    ERC721HolderUpgradeable
{
    bytes32 public constant RELAYER_ROLE = keccak256("RELAYER_ROLE");
    bytes32 public constant PAUSER_ROLE  = keccak256("PAUSER_ROLE");

    /// Event: NFT dikunci di L1 (siap dicetak Wrapped di L2)
    event NFTLocked(
        bytes32 indexed transferId,
        address indexed nftContract,
        uint256 indexed tokenId,
        address sender,
        address recipient,
        uint256 destinationChainId,
        string tokenURI,
        string name,
        string symbol
    );

    /// Event: NFT dilepas kembali ke user dari vault
    event NFTReleased(
        bytes32 indexed transferId,
        address indexed nftContract,
        uint256 indexed tokenId,
        address receiver
    );

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(address admin, address relayer) public initializer {
        __AccessControl_init();
        __ReentrancyGuard_init();
        __Pausable_init();
        __ERC721Holder_init();

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(RELAYER_ROLE, relayer);
        _grantRole(PAUSER_ROLE, admin);
    }

    // ---------------------------------------------------------
    // PAUSER
    // ---------------------------------------------------------
    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    // ---------------------------------------------------------
    // USER: LOCK NFT (L1 → L2)
    // ---------------------------------------------------------
    function lockNFT(
        address nftAddress,
        uint256 tokenId,
        uint256 destinationChainId,
        address recipient
    ) external nonReentrant whenNotPaused {
        IERC721Upgradeable nft = IERC721Upgradeable(nftAddress);

        string memory uri = "";
        string memory collectionName = "";
        string memory collectionSymbol = "";
        
        try IERC721MetadataUpgradeable(nftAddress).tokenURI(tokenId) returns (string memory _uri) {
            uri = _uri;
        } catch {}

        // name()
        try IERC721MetadataUpgradeable(nftAddress).name() returns (string memory _name) {
            collectionName = _name;
        } catch {}

        // symbol()
        try IERC721MetadataUpgradeable(nftAddress).symbol() returns (string memory _symbol) {
            collectionSymbol = _symbol;
        } catch {}
        
        // Transfer NFT masuk ke vault (user harus approve)
        nft.safeTransferFrom(msg.sender, address(this), tokenId);

        // Generate transferID (mirip TokenVault)
        bytes32 transferId = keccak256(
            abi.encode(
                msg.sender,
                recipient,
                tokenId,
                block.timestamp,
                block.chainid,
                destinationChainId,
                nftAddress
            )
        );

        emit NFTLocked(
            transferId,
            nftAddress,
            tokenId,
            msg.sender,
            recipient,
            destinationChainId,
            uri,
            collectionName,
            collectionSymbol
        );
    }

    // ---------------------------------------------------------
    // RELAYER: RELEASE (L2 → L1)
    // ---------------------------------------------------------
    function releaseNFT(
        address nftAddress,
        uint256 tokenId,
        address to,
        bytes32 transferId
    ) external onlyRole(RELAYER_ROLE) nonReentrant whenNotPaused {
        IERC721Upgradeable nft = IERC721Upgradeable(nftAddress);

        require(nft.ownerOf(tokenId) == address(this), "NFT not in vault");

        nft.safeTransferFrom(address(this), to, tokenId);

        emit NFTReleased(
            transferId,
            nftAddress,
            tokenId,
            to
        );
    }

    // ---------------------------------------------------------
    // STORAGE GAP (upgrade-safe)
    // ---------------------------------------------------------
    uint256[50] private __gap;
}
