// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {PotUtil, req} from "./PotUtil.sol";

/// @title Receipt — ERC-721 (+ERC-165, metadata) for tokenised real-world receipts
/// @notice kind: 0 = invoice, 1 = content right, 2 = equipment. Only the issuer or
///         an approved minter can attest a new receipt; anyone can hold and move it.
/// @dev Storage is packed to keep Portaldot's per-item storage deposit low: one slot holds
///      owner | kind | note length | first 10 note bytes; the rest of the note (if any) goes in
///      ceil((len - 10) / 32) extra slots.
contract Receipt {
    string public constant name = "PotKit Receipt";
    string public constant symbol = "RCPT";
    uint256 public constant MAX_NOTE = 140;

    address public issuer;
    uint256 public nextId = 1;
    mapping(address => bool) public minters;

    mapping(uint256 => uint256) private _tok; // owner (160) | kind (8) | note length (8) | note[0..10) (80)
    mapping(uint256 => bytes32[5]) private _tail; // note[10..140)
    mapping(address => uint256) private _balances;
    mapping(uint256 => address) private _approved;
    mapping(address => mapping(address => bool)) private _operators;

    event Transfer(address indexed from, address indexed to, uint256 indexed tokenId);
    event Approval(address indexed owner, address indexed approved, uint256 indexed tokenId);
    event ApprovalForAll(address indexed owner, address indexed operator, bool approved);
    event IssuerChanged(address indexed issuer);
    event MinterSet(address indexed minter, bool allowed);

    constructor() {
        issuer = msg.sender;
        emit IssuerChanged(msg.sender);
    }

    // ---- issuer controls -------------------------------------------------
    function setMinter(address who, bool allowed) external {
        req(msg.sender == issuer, "not issuer");
        minters[who] = allowed;
        emit MinterSet(who, allowed);
    }

    function transferIssuer(address next) external {
        req(msg.sender == issuer, "not issuer");
        req(next != address(0), "zero");
        issuer = next;
        emit IssuerChanged(next);
    }

    function mint(address to, uint8 kind, string calldata note_) external returns (uint256 id) {
        req(msg.sender == issuer || minters[msg.sender], "not minter");
        req(to != address(0), "zero");
        req(kind < 3, "kind");
        uint256 n = bytes(note_).length;
        req(n > 0 && n <= MAX_NOTE, "note length");
        uint256 off;
        uint256 bad;
        assembly {
            off := note_.offset
            // printable only, no quote / backslash / DEL (keeps tokenURI JSON valid); UTF-8 bytes >= 0x80 are fine
            for { let i := 0 } lt(i, n) { i := add(i, 1) } {
                let c := byte(0, calldataload(add(off, i)))
                bad := or(bad, or(lt(c, 0x20), or(eq(c, 0x22), or(eq(c, 0x5c), eq(c, 0x7f)))))
            }
        }
        req(bad == 0, "note char");
        unchecked { id = nextId++; }
        uint256 head;
        assembly { head := shr(176, calldataload(off)) }
        if (n < 10) head = head >> (8 * (10 - n)) << (8 * (10 - n));
        _tok[id] = uint160(to) | (uint256(kind) << 160) | (n << 168) | (head << 176);
        bytes32[5] storage tail = _tail[id];
        for (uint256 i = 10; i < n; i += 32) {
            bytes32 w;
            assembly { w := calldataload(add(off, i)) }
            if (n - i < 32) w = w >> (8 * (32 - (n - i))) << (8 * (32 - (n - i)));
            tail[(i - 10) / 32] = w;
        }
        unchecked { _balances[to] += 1; }
        emit Transfer(address(0), to, id);
    }

    // ---- metadata reads ----------------------------------------------------
    function kindOf(uint256 id) public view returns (uint8) {
        return uint8(_tok[id] >> 160);
    }

    function note(uint256 id) public view returns (string memory s) {
        uint256 t = _tok[id];
        uint256 n = uint8(t >> 168);
        bytes memory b = new bytes(n + 64);
        assembly {
            mstore(b, n)
            mstore(add(b, 0x20), shl(176, shr(176, t)))
        }
        for (uint256 i = 10; i < n; i += 32) {
            bytes32 w = _tail[id][(i - 10) / 32];
            assembly { mstore(add(add(b, 0x20), i), w) }
        }
        s = string(b);
    }

    // ---- ERC-721 ---------------------------------------------------------
    function balanceOf(address owner) external view returns (uint256) {
        req(owner != address(0), "zero");
        return _balances[owner];
    }

    function ownerOf(uint256 id) public view returns (address owner) {
        owner = address(uint160(_tok[id]));
        req(owner != address(0), "no token");
    }

    function getApproved(uint256 id) external view returns (address) {
        ownerOf(id);
        return _approved[id];
    }

    function isApprovedForAll(address owner, address operator) public view returns (bool) {
        return _operators[owner][operator];
    }

    function approve(address spender, uint256 id) external {
        address owner = ownerOf(id);
        req(msg.sender == owner || _operators[owner][msg.sender], "auth");
        _approved[id] = spender;
        emit Approval(owner, spender, id);
    }

    function setApprovalForAll(address operator, bool approved) external {
        _operators[msg.sender][operator] = approved;
        emit ApprovalForAll(msg.sender, operator, approved);
    }

    function transferFrom(address from, address to, uint256 id) public {
        address owner = ownerOf(id);
        req(owner == from, "from");
        req(to != address(0), "zero");
        req(msg.sender == owner || _approved[id] == msg.sender || _operators[owner][msg.sender], "auth");
        delete _approved[id];
        unchecked { // from owns id, so its balance is >= 1
            _balances[from] -= 1;
            _balances[to] += 1;
        }
        _tok[id] = (_tok[id] >> 160 << 160) | uint160(to);
        emit Transfer(from, to, id);
    }

    function safeTransferFrom(address from, address to, uint256 id) external {
        safeTransferFrom(from, to, id, msg.data[0:0]);
    }

    function safeTransferFrom(address from, address to, uint256 id, bytes calldata data) public {
        transferFrom(from, to, id);
        if (to.code.length > 0) {
            bool ok;
            assembly {
                // onERC721Received(msg.sender, from, id, data) must return its own selector
                let p := mload(0x40)
                mstore(p, shl(224, 0x150b7a02))
                mstore(add(p, 0x04), caller())
                mstore(add(p, 0x24), from)
                mstore(add(p, 0x44), id)
                mstore(add(p, 0x64), 0x80)
                mstore(add(p, 0x84), data.length)
                calldatacopy(add(p, 0xa4), data.offset, data.length)
                ok := call(gas(), to, 0, p, add(0xc4, data.length), p, 0x20)
                ok := and(ok, and(gt(returndatasize(), 31), eq(shr(224, mload(p)), 0x150b7a02)))
            }
            req(ok, "receiver");
        }
    }

    // ---- ERC-165 / metadata ---------------------------------------------
    function supportsInterface(bytes4 id) external pure returns (bool) {
        return id == 0x01ffc9a7 || id == 0x80ac58cd || id == 0x5b5e139f;
    }

    function kindLabel(uint8 kind) public pure returns (string memory) {
        if (kind == 0) return "Invoice";
        if (kind == 1) return "Content right";
        return "Equipment";
    }

    function tokenURI(uint256 id) external view returns (string memory) {
        ownerOf(id);
        string memory label = kindLabel(kindOf(id));
        string memory d = note(id);
        string memory num = PotUtil.u2s(id);
        bytes memory json = abi.encodePacked(
            '{"name":"PotKit Receipt #', num, '","description":"', d,
            '","attributes":[{"trait_type":"Kind","value":"', label, '"}]}'
        );
        return string.concat("data:application/json;base64,", PotUtil.b64(json));
    }
}
