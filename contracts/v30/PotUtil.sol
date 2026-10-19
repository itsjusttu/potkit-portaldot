// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @dev require() with a short (<= 32 byte) reason, compiled once and shared by every call site.
///      Reverts with the standard Error(string) payload, so wallets/UIs see the same reason text
///      as a plain `require(cond, "reason")` — at a fraction of the bytecode (storage deposit) cost.
function req(bool ok, bytes32 reason) pure {
    if (!ok) {
        assembly {
            let n := 0
            for {} and(lt(n, 32), gt(byte(n, reason), 0)) {} { n := add(n, 1) }
            mstore(0x00, 0x08c379a000000000000000000000000000000000000000000000000000000000)
            mstore(0x04, 0x20)
            mstore(0x24, n)
            mstore(0x44, reason)
            revert(0x00, 0x64)
        }
    }
}

/// @dev Compact external call: target.sel(a, b, c). Extra (unused) argument words are ignored by the
///      callee's ABI decoder, so one helper serves 0..3-argument calls. Bubbles the callee's revert
///      reason; returns the 32-byte word number `idx` of the return data (0 if there is none).
///      One shared copy of this replaces a ~150-250 byte high-level call stub at every call site.
function ext(address t, bytes4 sel, uint256 a, uint256 b, uint256 c, uint256 idx) returns (uint256 r) {
    assembly {
        let p := mload(0x40)
        mstore(p, sel)
        mstore(add(p, 0x04), a)
        mstore(add(p, 0x24), b)
        mstore(add(p, 0x44), c)
        if iszero(call(gas(), t, 0, p, 0x64, 0, 0)) {
            returndatacopy(p, 0, returndatasize())
            revert(p, returndatasize())
        }
        let at := shl(5, idx)
        if gt(returndatasize(), add(at, 31)) {
            returndatacopy(p, at, 0x20)
            r := mload(p)
        }
    }
}

/// @dev Read-only twin of ext(): staticcall target.sel(a, b), return word `idx` (0 if none).
function sv(address t, bytes4 sel, uint256 a, uint256 b, uint256 idx) view returns (uint256 r) {
    assembly {
        let p := mload(0x40)
        mstore(p, sel)
        mstore(add(p, 0x04), a)
        mstore(add(p, 0x24), b)
        if iszero(staticcall(gas(), t, p, 0x44, 0, 0)) {
            returndatacopy(p, 0, returndatasize())
            revert(p, returndatasize())
        }
        let at := shl(5, idx)
        if gt(returndatasize(), add(at, 31)) {
            returndatacopy(p, at, 0x20)
            r := mload(p)
        }
    }
}

/// @dev ERC-20 transfer / transferFrom that accepts tokens returning `true` or nothing (USDT-style);
///      reverts with `reason` otherwise (same behaviour as the old low-level call + abi.decode).
function tokenCall(address t, bytes4 sel, uint256 a, uint256 b, uint256 c, bytes32 reason) {
    bool ok;
    assembly {
        let p := mload(0x40)
        mstore(p, sel)
        mstore(add(p, 0x04), a)
        mstore(add(p, 0x24), b)
        mstore(add(p, 0x44), c)
        ok := call(gas(), t, 0, p, 0x64, p, 0x20)
        ok := and(ok, or(iszero(returndatasize()), and(gt(returndatasize(), 31), eq(mload(p), 1))))
    }
    req(ok, reason);
}

/// @dev Tiny helpers shared by the PotKit contracts (no external dependencies).
library PotUtil {
    function u2s(uint256 v) internal pure returns (string memory s) {
        // writes digits right-to-left into a 96-byte scratch buffer (uint256 has <= 78 digits)
        assembly {
            s := mload(0x40)
            let end := add(s, 0x80)
            mstore(0x40, add(end, 0x20))
            let p := end
            for {} 1 {} {
                p := sub(p, 1)
                mstore8(p, add(48, mod(v, 10)))
                v := div(v, 10)
                if iszero(v) { break }
            }
            let n := sub(end, p)
            s := sub(p, 0x20)
            mstore(s, n)
        }
    }

    /// @dev Standard base64 (with '=' padding).
    function b64(bytes memory data) internal pure returns (string memory out) {
        assembly {
            let len := mload(data)
            mstore(add(add(data, 0x20), len), 0) // zero the bytes after the input (free memory)
            out := add(mload(0x40), 0x20)
            let olen := mul(4, div(add(len, 2), 3))
            mstore(out, olen)
            mstore(0x1f, "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef")
            mstore(0x3f, "ghijklmnopqrstuvwxyz0123456789+/")
            let src := data
            let dst := add(out, 0x20)
            let srcEnd := add(data, len)
            for {} lt(src, srcEnd) {} {
                src := add(src, 3)
                let x := mload(src)
                mstore8(dst, mload(and(shr(18, x), 0x3f)))
                mstore8(add(dst, 1), mload(and(shr(12, x), 0x3f)))
                mstore8(add(dst, 2), mload(and(shr(6, x), 0x3f)))
                mstore8(add(dst, 3), mload(and(x, 0x3f)))
                dst := add(dst, 4)
            }
            switch mod(len, 3)
            case 1 { mstore8(sub(dst, 1), 0x3d) mstore8(sub(dst, 2), 0x3d) }
            case 2 { mstore8(sub(dst, 1), 0x3d) }
            mstore(0x40, and(add(add(out, 0x3f), olen), not(31)))
        }
    }
}
