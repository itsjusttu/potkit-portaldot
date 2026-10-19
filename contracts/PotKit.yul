/// PotKit — one contract for Portaldot V3 (pallet-revive), hand-written in Yul because every byte of
/// deployed code costs storage deposit. It is at the same time:
///   * the ERC-721 receipt registry ("PotKit Receipt" / RCPT),
///   * the vault that locks a receipt and issues fixed-supply ERC-20 shares against it,
///   * the settlement pool (invoices are paid and claimed in native tPOT),
///   * the fixed-price share market (escrowed listings, paid in native tPOT).
/// Every lock cycle of a receipt uses one ERC-20 address: an 82-byte forwarder (the same code for every
/// receipt, so Portaldot stores that code once) that relays calls here with the original caller appended,
/// and emits the ERC-20 events when this contract asks it to. Balances live in this contract.
/// ABI: IPotKit.sol / IFraction.sol. Batch views (rows, statuses, claimables, listings, metadata) are in
/// Lens.sol, which is never deployed: it runs inside eth_call and reads storage through peek(slots).
/// Revert reasons are written as need(cond, <reason string>); scripts/yulprep.mjs turns each reason into a
/// one-letter Error(string) code before compiling (the dApp maps the codes back, see REASON_CODES in the artifacts).
///
/// Storage (k(a, b) = keccak256(a . b)):
///   slot 0                      listing count (48) | receipt count (48 @ 48) | issuer (160 @ 96)
///   k(id, 1)                    owner (160) | kind (8) | note length (8) | note bytes 0..9 (80)
///   k(id, 2) + i                note bytes 10 + 32 i ..
///   k(owner, 3)                 ERC-721 balance
///   k(id, 4)                    ERC-721 approved
///   k(operator, owner<<8 | 5)   ERC-721 operator flag
///   k(who, 6)                   minter flag
///   k(id, 7)                    share token (160) | due date (40) | units (40) | settled (1) | lock cycle (15)
///   k(id, 8)                    depositor (160) | face value in wei (96)
///   k(id, 9)                    amount paid in wei (128) | shares burned by claims (128)
///   k(token, 10)                receipt id of a share token
///   k(holder, id<<8 | 11)       share balance
///   k(k(owner, spender), id<<24 | cycle<<8 | 12)   share allowance (a new lock cycle resets them)
///   k(lid, 13)                  seller (160) | price in wei per whole share (96)
///   k(lid, 13) + 1              receipt id (64) | remaining share units (128 @ 128)
object "PotKit" {
    code {
        sstore(0, shl(96, caller()))
        datacopy(0, dataoffset("runtime"), datasize("runtime"))
        return(0, datasize("runtime"))
    }
    object "runtime" {
        code {
            let sel := shr(224, calldataload(0))
            let rid := sload(k(caller(), 10))
            if rid { token(sel, rid) }
            switch sel
            // ---------------- ERC-721 ----------------
            case 0x70a08231 { // balanceOf(address)
                let a := low(calldataload(4))
                need(a, "zero")
                ret(sload(k(a, 3)))
            }
            case 0x6352211e { ret(ownerOrFail(calldataload(4))) } // ownerOf(uint256)
            case 0x081812fc { // getApproved(uint256)
                let id := calldataload(4)
                pop(ownerOrFail(id))
                ret(sload(k(id, 4)))
            }
            case 0xe985e9c5 { ret(isOp(low(calldataload(4)), low(calldataload(36)))) } // isApprovedForAll(address,address)
            case 0x095ea7b3 { // approve(address,uint256)
                let id := calldataload(36)
                let o := ownerOrFail(id)
                need(or(eq(caller(), o), isOp(o, caller())), "auth")
                let sp := low(calldataload(4))
                sstore(k(id, 4), sp)
                log4(0, 0, tA(), o, sp, id)
                stop()
            }
            case 0xa22cb465 { // setApprovalForAll(address,bool)
                let op := low(calldataload(4))
                let on := iszero(iszero(calldataload(36)))
                sstore(k(op, or(shl(8, caller()), 5)), on)
                mstore(0, on)
                log3(0, 0x20, 0x17307eab39ab6107e8899845ad3d59bd9653f200f220920489ca2b5937696c31, caller(), op)
                stop()
            }
            case 0x23b872dd { // transferFrom(address,address,uint256)
                xfer(low(calldataload(4)), low(calldataload(36)), calldataload(68))
                stop()
            }
            case 0x42842e0e { safeXfer(0) } // safeTransferFrom(address,address,uint256)
            case 0xb88d4fde { safeXfer(add(4, calldataload(100))) } // safeTransferFrom(address,address,uint256,bytes)
            case 0x01ffc9a7 { // supportsInterface(bytes4): ERC-165, ERC-721, ERC-721 metadata
                let i := shr(224, calldataload(4))
                ret(or(eq(i, 0x01ffc9a7), or(eq(i, 0x80ac58cd), eq(i, 0x5b5e139f))))
            }
            case 0x06fdde03 { retStr("PotKit Receipt", 14, 0) } // name()
            case 0x95d89b41 { retStr("RCPT", 4, 0) } // symbol()
            case 0xc87b56dd { // tokenURI(uint256): the JSON is rendered off-chain from this contract's storage
                let id := calldataload(4)
                pop(ownerOrFail(id))
                retStr("https://potkit.pro/api/r?id=", 28, id)
            }
            // ---------------- receipts ----------------
            case 0x1d143848 { ret(shr(96, sload(0))) } // issuer()
            case 0xcf456ae7 { // setMinter(address,bool)
                need(eq(caller(), shr(96, sload(0))), "not issuer")
                sstore(k(low(calldataload(4)), 6), iszero(iszero(calldataload(36))))
                stop()
            }
            case 0xfc1cc1d1 { mint() } // mint(address,uint8,string)
            // ---------------- vault ----------------
            case 0x1be84ba4 { fractionalize() } // fractionalize(uint256,uint256,uint256,uint64)
            case 0xdb006a75 { redeem(calldataload(4)) } // redeem(uint256)
            case 0x8df82800 { settle(calldataload(4)) } // settle(uint256) payable
            case 0x379607f5 { claim(calldataload(4)) } // claim(uint256)
            // ---------------- market ----------------
            case 0x19aeb490 { list(calldataload(4), calldataload(36), calldataload(68)) } // list(uint256,uint256,uint256)
            case 0xd6febde8 { buy(calldataload(4), calldataload(36)) } // buy(uint256,uint256) payable
            case 0x40e58ee5 { cancel(calldataload(4)) } // cancel(uint256)
            // ---------------- raw reads for Lens ----------------
            case 0xb3ada260 { // peek(uint256[] slots) -> uint256[]
                let off := add(4, calldataload(4))
                let n := calldataload(off)
                mstore(0x80, 0x20)
                mstore(0xa0, n)
                for { let i := 0 } lt(i, n) { i := add(i, 1) } {
                    let o := shl(5, i)
                    mstore(add(0xc0, o), sload(calldataload(add(add(off, 0x20), o))))
                }
                return(0x80, add(0x40, shl(5, n)))
            }
            default { revert(0, 0) }

            // ======================= helpers =======================
            function k(a, b) -> s {
                mstore(0, a)
                mstore(0x20, b)
                s := keccak256(0, 0x40)
            }
            /// Transfer / Approval topics (the same for ERC-721 and ERC-20)
            function tT() -> t { t := 0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef }
            function tA() -> t { t := 0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925 }
            function low(x) -> y { y := and(x, 0xffffffffffffffffffffffffffffffffffffffff) }
            function ret(v) {
                mstore(0, v)
                return(0, 0x20)
            }
            function need(ok, reason) { if iszero(ok) { fail(reason) } }
            /// revert Error(reason): `reason` is a one-letter code (see scripts/yulprep.mjs)
            function fail(reason) {
                mstore(0, shl(224, 0x08c379a0))
                mstore(4, 0x20)
                mstore(0x24, 1)
                mstore(0x44, shl(248, reason))
                revert(0, 0x64)
            }
            /// return the ABI string `prefix` (len bytes, at most 32) followed by the decimal digits of num (if num != 0)
            function retStr(prefix, len, num) {
                mstore(0x80, 0x20)
                mstore(0xc0, prefix)
                let n := 0
                for { let t := num } t { t := div(t, 10) } { n := add(n, 1) }
                let total := add(len, n)
                for { let p := add(0xc0, total) } n { n := sub(n, 1) } {
                    p := sub(p, 1)
                    mstore8(p, add(48, mod(num, 10)))
                    num := div(num, 10)
                }
                mstore(0xa0, total)
                return(0x80, add(0x40, and(add(total, 31), not(31))))
            }
            function settled(t) -> s { s := and(shr(240, t), 1) }
            function unitsOf(t) -> u { u := and(shr(200, t), 0xffffffffff) }
            function cycleOf(t) -> c { c := shr(241, t) }
            function supplyOf(t) -> s { s := mul(unitsOf(t), 1000000000000000000) }
            function shareSlot(holder, id) -> s { s := k(holder, or(shl(8, id), 11)) }
            /// one event for the dApp timeline: Activity(id, actor, kind, a, b, c)
            ///   1 lock(units, faceValue, dueDate) · 2 redeem · 4 settle(amount) · 5 claim(shares, payout)
            ///   6 list(listingId, price, amount) · 7 buy(listingId, amount, cost) · 8 cancel(listingId, returned)
            function act(id, kind, a, b, c) {
                mstore(0, kind)
                mstore(0x20, a)
                mstore(0x40, b)
                mstore(0x60, c)
                log3(0, 0x80, 0x9474b02fc45390e98fd94699500c2cb9403c4315f81209bfdf574aa18e8777b7, id, caller())
            }
            function pay(to, v) {
                if v { need(call(gas(), to, v, 0, 0, 0, 0), "pay") }
            }

            // ---------------- ERC-721 internals ----------------
            function ownerOrFail(id) -> o {
                o := low(sload(k(id, 1)))
                need(o, "no token")
            }
            function isOp(o, op) -> b { b := sload(k(op, or(shl(8, o), 5))) }
            function xfer(f, t, id) {
                let w := sload(k(id, 1))
                let o := low(w)
                need(o, "no token")
                need(eq(o, f), "from")
                need(t, "zero")
                let ap := k(id, 4)
                need(or(eq(caller(), o), or(eq(sload(ap), caller()), isOp(o, caller()))), "auth")
                sstore(ap, 0)
                moveNft(f, t, id, w)
            }
            function moveNft(f, t, id, w) {
                let s := k(f, 3)
                sstore(s, sub(sload(s), 1))
                s := k(t, 3)
                sstore(s, add(sload(s), 1))
                sstore(k(id, 1), or(and(w, not(0xffffffffffffffffffffffffffffffffffffffff)), t))
                log4(0, 0, tT(), f, t, id)
            }
            /// dataOff = calldata offset of the `bytes` length word (0 = no data)
            function safeXfer(dataOff) {
                let f := low(calldataload(4))
                let t := low(calldataload(36))
                let id := calldataload(68)
                xfer(f, t, id)
                if extcodesize(t) {
                    let len := 0
                    if dataOff { len := calldataload(dataOff) }
                    mstore(0x80, shl(224, 0x150b7a02)) // onERC721Received(operator, from, id, data)
                    mstore(0x84, caller())
                    mstore(0xa4, f)
                    mstore(0xc4, id)
                    mstore(0xe4, 0x80)
                    mstore(0x104, len)
                    calldatacopy(0x124, add(dataOff, 0x20), len)
                    mstore(0, 0)
                    let ok := call(gas(), t, 0, 0x80, add(0xa4, len), 0, 0x20)
                    need(and(ok, eq(shr(224, mload(0)), 0x150b7a02)), "receiver")
                }
                stop()
            }

            // ---------------- receipts ----------------
            /// mint(to, kind, note): kind 0 invoice · 1 content right · 2 equipment; note 1..140 bytes
            /// (metadata JSON is built off-chain, which escapes the note)
            function mint() {
                let c := sload(0)
                need(or(eq(caller(), shr(96, c)), sload(k(caller(), 6))), "not minter")
                let to := low(calldataload(4))
                need(to, "zero")
                let kind := calldataload(36)
                need(lt(kind, 3), "kind")
                let p := add(4, calldataload(68))
                let n := calldataload(p)
                p := add(p, 0x20)
                need(and(iszero(iszero(n)), lt(n, 141)), "note length")
                let id := add(and(shr(48, c), 0xffffffffffff), 1)
                sstore(0, add(c, shl(48, 1)))
                sstore(k(id, 1), or(or(to, shl(160, kind)), or(shl(168, n), shl(176, shr(176, calldataload(p))))))
                let base := k(id, 2)
                for { let i := 10 } lt(i, n) { i := add(i, 32) } {
                    sstore(add(base, shr(5, sub(i, 10))), calldataload(add(p, i)))
                }
                let s := k(to, 3)
                sstore(s, add(sload(s), 1))
                log4(0, 0, tT(), 0, to, id)
                ret(id)
            }

            // ---------------- shares (ERC-20 ledger) ----------------
            /// ask the share token to emit an event from its own address: [topic0, topic1, topic2, value]
            function emit20(tok, topic, a, b, v) {
                mstore(0, topic)
                mstore(0x20, a)
                mstore(0x40, b)
                mstore(0x60, v)
                pop(call(gas(), tok, 0, 0, 0x80, 0, 0))
            }
            function emitT(tok, a, b, v) { emit20(tok, tT(), a, b, v) }
            function moveShares(id, tok, f, t, amt) {
                need(t, "zero")
                let fs := shareSlot(f, id)
                let fb := sload(fs)
                need(iszero(lt(fb, amt)), "balance")
                sstore(fs, sub(fb, amt))
                let ts := shareSlot(t, id)
                sstore(ts, add(sload(ts), amt))
                emitT(tok, f, t, amt)
            }
            function allowSlot(o, sp, id, t) -> s { s := k(k(o, sp), or(shl(24, id), or(shl(8, cycleOf(t)), 12))) }
            /// ERC-20 calls arriving through a share token: caller() is the token, the original sender is
            /// the last calldata word (appended by the token)
            function token(fsel, id) {
                let t := sload(k(id, 7))
                let from := calldataload(sub(calldatasize(), 0x20))
                switch fsel
                case 0x06fdde03 { retStr("PotKit Fraction #", 17, id) } // name()
                case 0x95d89b41 { retStr("KIT", 3, id) } // symbol()
                case 0x313ce567 { ret(18) } // decimals()
                case 0x18160ddd { ret(sub(supplyOf(t), shr(128, sload(k(id, 9))))) } // totalSupply(): claimed shares are burned
                case 0x70a08231 { ret(sload(shareSlot(low(calldataload(4)), id))) } // balanceOf(address)
                case 0xdd62ed3e { ret(sload(allowSlot(low(calldataload(4)), low(calldataload(36)), id, t))) } // allowance(address,address)
                case 0xa9059cbb { // transfer(address,uint256)
                    moveShares(id, caller(), from, low(calldataload(4)), calldataload(36))
                    ret(1)
                }
                case 0x095ea7b3 { // approve(address,uint256)
                    let sp := low(calldataload(4))
                    let v := calldataload(36)
                    sstore(allowSlot(from, sp, id, t), v)
                    emit20(caller(), tA(), from, sp, v)
                    ret(1)
                }
                case 0x23b872dd { // transferFrom(address,address,uint256); max allowance is never decreased
                    let o := low(calldataload(4))
                    let v := calldataload(68)
                    let as := allowSlot(o, from, id, t)
                    let al := sload(as)
                    if not(al) {
                        need(iszero(lt(al, v)), "allowance")
                        sstore(as, sub(al, v))
                    }
                    moveShares(id, caller(), o, low(calldataload(36)), v)
                    ret(1)
                }
                default { revert(0, 0) }
            }

            // ---------------- vault ----------------
            /// fractionalize(id, units, faceValue, dueDate): the receipt owner locks it (no NFT approval
            /// needed), sets the settlement terms (faceValue in wei of tPOT, dueDate 0 = none) and receives
            /// units * 1e18 shares
            function fractionalize() {
                let id := calldataload(4)
                let units := calldataload(36)
                let face := calldataload(68)
                let due := calldataload(100)
                need(and(iszero(iszero(units)), lt(units, 1000000000001)), "units")
                need(and(iszero(iszero(face)), iszero(shr(96, face))), "amount")
                if due { need(and(gt(due, timestamp()), lt(due, 0x10000000000)), "due date") }
                let w := sload(k(id, 1))
                need(eq(low(w), caller()), "from") // a locked receipt is owned by this contract
                let ts := k(id, 7)
                let t := sload(ts)
                let tok := low(t)
                if iszero(tok) {
                    // 91-byte init code that returns the 82-byte forwarder bound to address()
                    mstore(0x80, shl(176, 0x60528060093d393df373))
                    mstore(0x8a, shl(96, address()))
                    mstore(0x9e, 0x803314603e57363d3d373336523d3d366020013d3d855af13d6000803e603957)
                    mstore(0xbe, 0x3d6000fd5b3d6000f35b602060603d376040356020353d3560203da300000000)
                    tok := create(0, 0x80, 91)
                    need(tok, "clone")
                    sstore(k(tok, 10), id)
                }
                sstore(ts, or(or(tok, and(t, shl(241, 0x7fff))), or(shl(160, due), shl(200, units))))
                sstore(k(id, 8), or(caller(), shl(160, face)))
                moveNft(caller(), address(), id, w)
                let supply := mul(units, 1000000000000000000)
                sstore(shareSlot(caller(), id), supply)
                emitT(tok, 0, caller(), supply)
                act(id, 1, units, face, due)
                ret(tok)
            }
            /// redeem(id): whoever holds every outstanding share gets the receipt back. After settlement
            /// all shares must be claimed first; then the depositor redeems.
            function redeem(id) {
                let ts := k(id, 7)
                let t := sload(ts)
                let supply := supplyOf(t)
                need(supply, "not locked")
                let ps := k(id, 9)
                let outstanding := sub(supply, shr(128, sload(ps)))
                if settled(t) { need(iszero(outstanding), "claim first") }
                let ls := k(id, 8)
                if iszero(outstanding) { need(eq(caller(), low(sload(ls))), "not depositor") }
                let bs := shareSlot(caller(), id)
                need(eq(sload(bs), outstanding), "need all units")
                sstore(bs, 0)
                // keep the token, bump the lock cycle (resets allowances), clear terms / settlement
                sstore(ts, or(low(t), shl(241, add(cycleOf(t), 1))))
                sstore(ls, 0)
                sstore(ps, 0)
                emitT(low(t), caller(), 0, outstanding)
                moveNft(address(), caller(), id, sload(k(id, 1)))
                act(id, 2, 0, 0, 0)
                stop()
            }
            /// settle(id) payable: anyone pays msg.value >= faceValue tPOT into the pool
            function settle(id) {
                let ts := k(id, 7)
                let t := sload(ts)
                need(unitsOf(t), "not locked")
                need(iszero(settled(t)), "settled")
                let v := callvalue()
                need(iszero(lt(v, shr(160, sload(k(id, 8))))), "underpaid")
                sstore(ts, or(t, shl(240, 1)))
                sstore(k(id, 9), v)
                act(id, 4, v, 0, 0)
                stop()
            }
            /// claim(id): burn all your shares for your pro-rata part of the pool (paid in tPOT)
            function claim(id) {
                let t := sload(k(id, 7))
                need(settled(t), "not settled")
                let bs := shareSlot(caller(), id)
                let shares := sload(bs)
                need(shares, "no shares")
                let ps := k(id, 9)
                let p := sload(ps)
                let amount := and(p, 0xffffffffffffffffffffffffffffffff)
                let burned := shr(128, p)
                let supply := supplyOf(t)
                // cumulative rounding: the payouts add up to exactly `amount` once every share is claimed
                let payout := sub(div(mul(amount, add(burned, shares)), supply), div(mul(amount, burned), supply))
                sstore(bs, 0)
                sstore(ps, add(p, shl(128, shares)))
                emitT(low(t), caller(), 0, shares)
                act(id, 5, shares, payout, 0)
                pay(caller(), payout)
                ret(payout)
            }

            // ---------------- market ----------------
            function cost(price, amount) -> c { c := div(add(mul(price, amount), 999999999999999999), 1000000000000000000) }
            /// list(id, price, amount): escrow `amount` share units; price is wei of tPOT per whole share
            function list(id, price, amount) {
                need(and(iszero(iszero(amount)), iszero(shr(128, amount))), "amount")
                need(and(iszero(iszero(price)), iszero(shr(96, price))), "price")
                let t := sload(k(id, 7))
                need(unitsOf(t), "not locked")
                need(iszero(settled(t)), "settled")
                moveShares(id, low(t), caller(), address(), amount)
                let c := sload(0)
                let lid := and(c, 0xffffffffffff)
                sstore(0, add(c, 1))
                let w := k(lid, 13)
                sstore(w, or(caller(), shl(160, price)))
                sstore(add(w, 1), or(id, shl(128, amount)))
                act(id, 6, lid, price, amount)
                ret(lid)
            }
            function listingSlot(lid) -> w {
                need(lt(lid, and(sload(0), 0xffffffffffff)), "no listing")
                w := k(lid, 13)
            }
            /// buy(lid, amount) payable: msg.value must equal ceil(price * amount / 1e18)
            function buy(lid, amount) {
                let w := listingSlot(lid)
                let a := sload(w)
                let b := sload(add(w, 1))
                let seller := low(a)
                let id := and(b, 0xffffffffffffffff)
                need(and(iszero(iszero(amount)), iszero(gt(amount, shr(128, b)))), "amount")
                need(iszero(eq(caller(), seller)), "own listing")
                let t := sload(k(id, 7))
                need(iszero(settled(t)), "settled")
                let c := cost(shr(160, a), amount)
                need(eq(callvalue(), c), "value")
                sstore(add(w, 1), sub(b, shl(128, amount)))
                moveShares(id, low(t), address(), caller(), amount)
                act(id, 7, lid, amount, c)
                pay(seller, c)
                ret(c)
            }
            function cancel(lid) {
                let w := listingSlot(lid)
                need(eq(caller(), low(sload(w))), "not seller")
                let b := sload(add(w, 1))
                let left := shr(128, b)
                need(left, "closed")
                let id := and(b, 0xffffffffffffffff)
                sstore(add(w, 1), id)
                moveShares(id, low(sload(k(id, 7))), address(), caller(), left)
                act(id, 8, lid, left, 0)
                stop()
            }
        }
    }
}
