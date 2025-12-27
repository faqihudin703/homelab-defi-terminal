// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC721/extensions/ERC721URIStorageUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/CountersUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/cryptography/ECDSAUpgradeable.sol";

/*
 * ======================================================================
 *  V1  — HomelabCollectionUpgradeable (inline, original layout preserved)
 * ======================================================================
 */
contract HomelabCollectionUpgradeableV2 is
    Initializable,
    ERC721URIStorageUpgradeable,
    OwnableUpgradeable,
    PausableUpgradeable
{
    using CountersUpgradeable for CountersUpgradeable.Counter;
    using ECDSAUpgradeable for bytes32;

    // -------------------------
    // V1 STORAGE (MUST MATCH EXACTLY)
    // -------------------------
    CountersUpgradeable.Counter private _tokenIds;
    uint256 public mintPrice;

    event NFTMinted(uint256 indexed tokenId, address indexed minter, string tokenURI);

    // -------------------------
    // V1 INITIALIZER (unchanged)
    // -------------------------
    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(
        string memory name_,
        string memory symbol_,
        address owner_,
        uint256 mintPrice_
    ) public initializer {
        __ERC721_init(name_, symbol_);
        __ERC721URIStorage_init();
        __Ownable_init();
        __Pausable_init();

        if (owner_ != address(0) && owner_ != _msgSender()) {
            transferOwnership(owner_);
        }

        mintPrice = mintPrice_;
    }

    // -------------------------
    // V1 — MINT
    // -------------------------
    function mint(string memory _tokenURI)
        public
        payable
        whenNotPaused
        returns (uint256)
    {
        require(msg.value >= mintPrice, "Biaya minting kurang!");

        _tokenIds.increment();
        uint256 newItemId = _tokenIds.current();

        _safeMint(msg.sender, newItemId);
        _setTokenURI(newItemId, _tokenURI);

        emit NFTMinted(newItemId, msg.sender, _tokenURI);
        return newItemId;
    }

    // -------------------------
    // V1 — PAUSE
    // -------------------------
    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    // -------------------------
    // V1 — WITHDRAW
    // -------------------------
    function withdraw() public onlyOwner {
        uint256 balance = address(this).balance;
        require(balance > 0, "Saldo kosong");

        (bool sent, ) = payable(owner()).call{value: balance}("");
        require(sent, "Transfer gagal");
    }

    // -------------------------
    // V1 — ADMIN CONFIG
    // -------------------------
    function setMintPrice(uint256 _price) public onlyOwner {
        mintPrice = _price;
    }

    // -------------------------
    // V1 — PAUSABLE PROTECTION
    // -------------------------
    function _beforeTokenTransfer(
        address from,
        address to,
        uint256 tokenId,
        uint256 batchSize
    ) internal virtual override(ERC721Upgradeable) whenNotPaused {
        super._beforeTokenTransfer(from, to, tokenId, batchSize);
    }

    // ======================================================================
    //                              V2 FEATURES
    // ======================================================================

    event TokenURIUpdated(
        uint256 indexed tokenId,
        address indexed operator,
        string oldURI,
        string newURI
    );

    // signature replay protection
    mapping(uint256 => uint256) private nonces;

    function nonceOf(uint256 tokenId) external view returns (uint256) {
        return nonces[tokenId];
    }

    /**
     * @dev Owner updates metadata URI.
     * No limit — front-end handles user restrictions.
     */
    function updateTokenURI(uint256 tokenId, string memory newURI) external {
        require(_exists(tokenId), "Nonexistent token");
        require(msg.sender == ownerOf(tokenId), "Not owner");

        string memory oldURI = tokenURI(tokenId);
        _setTokenURI(tokenId, newURI);

        emit TokenURIUpdated(tokenId, msg.sender, oldURI, newURI);
    }

    /**
     * @dev Signature-based metadata update.
     *
     * Message signed off-chain:
     * keccak256(abi.encodePacked(owner, tokenId, keccak256(bytes(newURI)), nonce, address(this)))
     */
    function updateTokenURIWithSig(
        address tokenOwner,
        uint256 tokenId,
        string memory newURI,
        uint256 nonce,
        bytes memory signature
    ) external {
        require(_exists(tokenId), "Nonexistent token");
        require(ownerOf(tokenId) == tokenOwner, "Owner mismatch");
        require(nonces[tokenId] == nonce, "Bad nonce");

        bytes32 h = keccak256(
            abi.encodePacked(
                tokenOwner,
                tokenId,
                keccak256(bytes(newURI)),
                nonce,
                address(this)
            )
        );

        address recovered = h.toEthSignedMessageHash().recover(signature);
        require(recovered == tokenOwner, "Invalid signature");

        nonces[tokenId] += 1;

        string memory oldURI = tokenURI(tokenId);
        _setTokenURI(tokenId, newURI);

        emit TokenURIUpdated(tokenId, msg.sender, oldURI, newURI);
    }

    /**
     * @dev Burn NFT (owner or approved).
     */
    function burn(uint256 tokenId) external {
        require(_isApprovedOrOwner(msg.sender, tokenId), "Not owner/approved");
        _burn(tokenId);
    }

    // -------------------------
    // OVERRIDES
    // -------------------------
    function _burn(uint256 tokenId)
        internal
        override(ERC721URIStorageUpgradeable)
    {
        super._burn(tokenId);
    }

    function tokenURI(uint256 tokenId)
        public
        view
        override(ERC721URIStorageUpgradeable)
        returns (string memory)
    {
        return super.tokenURI(tokenId);
    }

    // -------------------------
    // STORAGE GAP UPDATE
    // V1 had uint256[45] gap.
    // V2 adds 1 new mapping => reduce gap by 1 (44 left).
    // -------------------------
    uint256[44] private __gapV2;
}
