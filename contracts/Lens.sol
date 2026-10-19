// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IPotKit} from "./IPotKit.sol";

/// @title Lens — batch reads for the PotKit UI. NEVER DEPLOYED.
/// @notice The frontend (and api/r.ts) run this contract's bytecode inside a plain `eth_call` (viem
///         "deployless" read: readContract({ code })), so none of this costs storage deposit on-chain.
///         It decodes PotKit's packed storage through IPotKit.peek(slots); the layout is documented at
///         the top of contracts/PotKit.yul.
contract Lens {
    /// pseudo-address used for "native tPOT" as the payment token
    address internal constant NATIVE = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;
    uint256 internal constant DUE_SOON = 3 days;
    uint256 internal constant M160 = (1 << 160) - 1;

    struct Row {
        uint256 id;
        address owner; // == the PotKit contract while locked
        uint8 kind;
        string note;
        address fraction; // share token while locked, else 0
        address depositor;
        uint256 supply; // outstanding shares (claimed shares are burned)
    }

    struct Settlement {
        address token; // NATIVE while locked
        uint256 faceValue;
        bool settled;
        uint256 amount;
        uint256 supply; // original supply (units * 1e18)
        uint256 paidOut;
    }

    struct Listing {
        address seller;
        address fraction;
        address payToken; // NATIVE
        uint256 price; // wei of tPOT per whole share
        uint256 remaining;
        uint256 receiptId;
    }

    function _k(uint256 a, uint256 b) internal pure returns (uint256) {
        return uint256(keccak256(abi.encode(a, b)));
    }

    function _peek(IPotKit k, uint256[] memory slots) internal view returns (uint256[] memory) {
        return k.peek(slots);
    }

    function _one(IPotKit k, uint256 slot) internal view returns (uint256) {
        uint256[] memory s = new uint256[](1);
        s[0] = slot;
        return k.peek(s)[0];
    }

    function count(IPotKit k) public view returns (uint256) {
        return (_one(k, 0) >> 48) & 0xffffffffffff;
    }

    function listingCount(IPotKit k) public view returns (uint256) {
        return _one(k, 0) & 0xffffffffffff;
    }

    /// @return issuer the issuer and whether `who` may mint
    function meta(IPotKit k, address who) external view returns (address issuer, bool canMint) {
        uint256[] memory s = new uint256[](2);
        s[0] = 0;
        s[1] = _k(uint256(uint160(who)), 6);
        uint256[] memory v = _peek(k, s);
        issuer = address(uint160(v[0] >> 96));
        canMint = who != address(0) && (who == issuer || v[1] != 0);
    }

    /// @dev receipt ids are 1-based: window [start, start+limit) clipped to [1, count], max 50.
    function _range(IPotKit k, uint256 start, uint256 limit) internal view returns (uint256, uint256) {
        uint256 last = count(k);
        if (start == 0) start = 1;
        if (limit > 50) limit = 50;
        if (start > last || limit == 0) return (start, 0);
        uint256 n = last - start + 1;
        return (start, n > limit ? limit : n);
    }

    /// raw words for receipt id: [k(id,1), k(id,7), k(id,8), k(id,9)]
    function _words(IPotKit k, uint256 id) internal view returns (uint256 r, uint256 t, uint256 l, uint256 p) {
        uint256[] memory s = new uint256[](4);
        s[0] = _k(id, 1);
        s[1] = _k(id, 7);
        s[2] = _k(id, 8);
        s[3] = _k(id, 9);
        uint256[] memory v = _peek(k, s);
        return (v[0], v[1], v[2], v[3]);
    }

    function _units(uint256 t) internal pure returns (uint256) {
        return (t >> 200) & 0xffffffffff;
    }

    function note(IPotKit k, uint256 id) public view returns (string memory) {
        uint256 r = _one(k, _k(id, 1));
        uint256 n = (r >> 168) & 0xff;
        bytes memory out = new bytes(n);
        uint256 head = r >> 176; // 10 bytes
        for (uint256 i; i < n && i < 10; i++) out[i] = bytes1(uint8(head >> (8 * (9 - i))));
        if (n > 10) {
            uint256 words = (n - 10 + 31) / 32;
            uint256[] memory s = new uint256[](words);
            uint256 base = _k(id, 2);
            for (uint256 w; w < words; w++) s[w] = base + w;
            uint256[] memory v = _peek(k, s);
            for (uint256 i = 10; i < n; i++) {
                uint256 j = i - 10;
                out[i] = bytes1(uint8(v[j / 32] >> (8 * (31 - (j % 32)))));
            }
        }
        return string(out);
    }

    function rows(IPotKit k, uint256 start, uint256 limit) external view returns (Row[] memory out) {
        uint256 n;
        (start, n) = _range(k, start, limit);
        out = new Row[](n);
        for (uint256 i; i < n; i++) {
            uint256 id = start + i;
            (uint256 r, uint256 t, uint256 l, uint256 p) = _words(k, id);
            uint256 u = _units(t);
            out[i] = Row(id, address(uint160(r)), uint8(r >> 160), note(k, id),
                u == 0 ? address(0) : address(uint160(t)), address(uint160(l)),
                u * 1e18 - (p >> 128));
        }
    }

    function settlements(IPotKit k, uint256 start, uint256 limit) external view returns (Settlement[] memory out) {
        uint256 n;
        (start, n) = _range(k, start, limit);
        out = new Settlement[](n);
        for (uint256 i; i < n; i++) {
            (, uint256 t, uint256 l, uint256 p) = _words(k, start + i);
            uint256 supply = _units(t) * 1e18;
            uint256 amount = uint128(p);
            out[i] = Settlement(supply == 0 ? address(0) : NATIVE, l >> 160, (t >> 240) & 1 == 1, amount, supply,
                supply == 0 ? 0 : (amount * (p >> 128)) / supply);
        }
    }

    /// @return st 0 Free · 1 Pending · 2 Due soon (<= 3 days) · 3 Overdue · 4 Settled, and dd due date
    function statuses(IPotKit k, uint256 start, uint256 limit) external view returns (uint8[] memory st, uint64[] memory dd) {
        uint256 n;
        (start, n) = _range(k, start, limit);
        st = new uint8[](n);
        dd = new uint64[](n);
        for (uint256 i; i < n; i++) {
            (, uint256 t,,) = _words(k, start + i);
            uint256 due = (t >> 160) & 0xffffffffff;
            dd[i] = uint64(due);
            if ((t >> 240) & 1 == 1) st[i] = 4;
            else if (_units(t) == 0) st[i] = 0;
            else if (due == 0) st[i] = 1;
            else if (block.timestamp > due) st[i] = 3;
            else if (due - block.timestamp <= DUE_SOON) st[i] = 2;
            else st[i] = 1;
        }
    }

    /// @return bal share balance of `who` for each id
    function balances(IPotKit k, address who, uint256 start, uint256 limit) external view returns (uint256[] memory bal) {
        uint256 n;
        (start, n) = _range(k, start, limit);
        uint256[] memory s = new uint256[](n);
        for (uint256 i; i < n; i++) s[i] = _k(uint256(uint160(who)), ((start + i) << 8) | 11);
        return n == 0 ? s : _peek(k, s);
    }

    /// @return c what claim(id) would pay `who` now, for each id
    function claimables(IPotKit k, address who, uint256 start, uint256 limit) external view returns (uint256[] memory c) {
        uint256 n;
        (start, n) = _range(k, start, limit);
        c = new uint256[](n);
        for (uint256 i; i < n; i++) {
            uint256 id = start + i;
            (, uint256 t,, uint256 p) = _words(k, id);
            if ((t >> 240) & 1 == 0) continue;
            uint256 shares = _one(k, _k(uint256(uint160(who)), (id << 8) | 11));
            uint256 supply = _units(t) * 1e18;
            uint256 amount = uint128(p);
            uint256 burned = p >> 128;
            c[i] = (amount * (burned + shares)) / supply - (amount * burned) / supply;
        }
    }

    /// @return out market listings [start, start+limit), max 50 (listing ids are 0-based)
    function listings(IPotKit k, uint256 start, uint256 limit) external view returns (Listing[] memory out) {
        uint256 n = listingCount(k);
        if (limit > 50) limit = 50;
        if (start >= n || limit == 0) return out;
        if (n - start < limit) limit = n - start;
        out = new Listing[](limit);
        uint256[] memory s = new uint256[](2 * limit);
        for (uint256 i; i < limit; i++) {
            uint256 w = _k(start + i, 13);
            s[2 * i] = w;
            s[2 * i + 1] = w + 1;
        }
        uint256[] memory v = _peek(k, s);
        for (uint256 i; i < limit; i++) {
            uint256 a = v[2 * i];
            uint256 b = v[2 * i + 1];
            uint256 rid = uint64(b);
            out[i] = Listing(address(uint160(a)), address(uint160(_one(k, _k(rid, 7)))), NATIVE, a >> 160, b >> 128, rid);
        }
    }

    /// @return the ERC-721 metadata JSON of receipt `id` (what https://potkit.pro/api/r?id=… serves)
    function tokenJson(IPotKit k, uint256 id) external view returns (string memory) {
        uint256 r = _one(k, _k(id, 1));
        require(r & M160 != 0, "no token");
        uint256 kind = (r >> 160) & 0xff;
        string memory label = kind == 0 ? "Invoice" : kind == 1 ? "Content right" : "Equipment";
        return string.concat('{"name":"PotKit Receipt #', _u2s(id), '","description":"', _esc(bytes(note(k, id))),
            '","attributes":[{"trait_type":"Kind","value":"', label, '"}]}');
    }

    function _u2s(uint256 v) internal pure returns (string memory) {
        if (v == 0) return "0";
        uint256 n;
        for (uint256 t = v; t != 0; t /= 10) n++;
        bytes memory b = new bytes(n);
        for (; v != 0; v /= 10) b[--n] = bytes1(uint8(48 + (v % 10)));
        return string(b);
    }

    /// JSON string escaping for the note (quotes, backslashes, control characters)
    function _esc(bytes memory s) internal pure returns (string memory) {
        bytes memory hexd = "0123456789abcdef";
        bytes memory out = new bytes(s.length * 6);
        uint256 j;
        for (uint256 i; i < s.length; i++) {
            bytes1 c = s[i];
            if (c == '"' || c == "\\") {
                out[j++] = "\\";
                out[j++] = c;
            } else if (uint8(c) < 0x20 || uint8(c) == 0x7f) {
                out[j++] = "\\";
                out[j++] = "u";
                out[j++] = "0";
                out[j++] = "0";
                out[j++] = hexd[uint8(c) >> 4];
                out[j++] = hexd[uint8(c) & 15];
            } else {
                out[j++] = c;
            }
        }
        assembly {
            mstore(out, j)
        }
        return string(out);
    }
}
