// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import "@openzeppelin/contracts-upgradeable/token/ERC721/ERC721Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC721/extensions/ERC721URIStorageUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

/**
 * @title WrappedNFT (Upgradeable)
 * @notice NFT representasi di chain tujuan (L2).
 * Metadata (name, symbol, tokenURI) diambil dari chain asal via Vault event.
 */
contract WrappedNFT is
    Initializable,
    ERC721Upgradeable,
    ERC721URIStorageUpgradeable,
    AccessControlUpgradeable,
    PausableUpgradeable
{
    bytes32 public constant RELAYER_ROLE = keccak256("RELAYER_ROLE");
    bytes32 public constant PAUSER_ROLE  = keccak256("PAUSER_ROLE");

    // Metadata asli dari L1
    string public originalName;
    string public originalSymbol;

    // Address koleksi asli di L1
    address public l1CollectionAddress;

    // Event untuk burn → kembali ke L1
    event NFTBurned(
        bytes32 indexed transferId,
        address indexed sender,
        uint256 indexed tokenId,
        address originalCollectionAddress,
        string tokenURI
    );

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(
        string memory _name,                 // original name from L1
        string memory _symbol,               // original symbol from L1
        address _admin,
        address _l1CollectionAddress
    ) public initializer
    {
        // Wrapped name & symbol
        string memory wrappedName = string.concat("Wrapped ", _name);
        string memory wrappedSymbol = string.concat("w", _symbol);

        __ERC721_init(wrappedName, wrappedSymbol);
        __ERC721URIStorage_init();
        __AccessControl_init();
        __Pausable_init();

        originalName = _name;
        originalSymbol = _symbol;
        l1CollectionAddress = _l1CollectionAddress;

        // Roles
        _grantRole(DEFAULT_ADMIN_ROLE, _admin);
        _grantRole(PAUSER_ROLE, _admin);
    }

    // -------------------------------------------------------
    // PAUSER
    // -------------------------------------------------------
    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    // -------------------------------------------------------
    // MINT WRAPPED (Relayer → L2)
    // -------------------------------------------------------
    function mintWrapped(
        address to,
        uint256 tokenId,
        string memory uri,
        bytes32 /*transferId*/
    ) external onlyRole(RELAYER_ROLE) whenNotPaused
    {
        require(!_exists(tokenId), "WrappedNFT: Already exists");

        _mint(to, tokenId);
        _setTokenURI(tokenId, uri);
    }

    // -------------------------------------------------------
    // BURN WRAPPED (User → back to L1)
    // -------------------------------------------------------
    function burnForBridge(uint256 tokenId, bytes32 transferId)
        external
        whenNotPaused
    {
        require(ownerOf(tokenId) == msg.sender, "Not token owner");

        string memory uri = tokenURI(tokenId);

        _burn(tokenId);

        emit NFTBurned(
            transferId,
            msg.sender,
            tokenId,
            l1CollectionAddress,
            uri
        );
    }

    // -------------------------------------------------------
    // REQUIRED OVERRIDES
    // -------------------------------------------------------
    function _burn(uint256 tokenId)
        internal
        override(ERC721Upgradeable, ERC721URIStorageUpgradeable)
    {
        super._burn(tokenId);
    }

    function tokenURI(uint256 tokenId)
        public
        view
        override(ERC721Upgradeable, ERC721URIStorageUpgradeable)
        returns (string memory)
    {
        return super.tokenURI(tokenId);
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(
            ERC721Upgradeable,
            ERC721URIStorageUpgradeable,
            AccessControlUpgradeable
        )
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }

    // -------------------------------------------------------
    // STORAGE GAP — future-proof upgrades
    // -------------------------------------------------------
    uint256[50] private __gap;
}
