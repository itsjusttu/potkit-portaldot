// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {PotUtil, req} from "./PotUtil.sol";

/// @title Fraction — fixed-supply ERC-20 that represents shares of ONE locked receipt.
/// @dev Deployed ONCE by the Vault (its constructor) as an implementation; every fractionalize
///      then creates a 45-byte EIP-1167 clone that delegates here and is initialised in the same
///      transaction. `vault` is an immutable of this implementation, so every clone shares it.
///      Per-clone storage is just 2 slots: receiptId|totalSupply and the holder's balance.
///      Supply is minted once, in init(). The Vault (and nobody else) can burn it, and only when a
///      single holder redeems the receipt or a holder claims their payout after settlement.
contract Fraction {
    uint8 public constant decimals = 18;
    address public immutable vault;
    uint256 private _meta; // receiptId (low 96 bits) | totalSupply (high 160 bits)

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    constructor() {
        vault = msg.sender;
    }

    /// @dev Called by the Vault right after it creates the clone. receiptId >= 1, so it can never run twice.
    function init(uint256 receiptId_, uint256 supply, address holder) external {
        req(msg.sender == vault && _meta == 0, "init");
        _meta = receiptId_ | (supply << 96);
        balanceOf[holder] = supply;
        emit Transfer(address(0), holder, supply);
    }

    function receiptId() public view returns (uint256) {
        return uint96(_meta);
    }

    function totalSupply() public view returns (uint256) {
        return _meta >> 96;
    }

    function name() external view returns (string memory) {
        return string.concat("PotKit Fraction #", PotUtil.u2s(receiptId()));
    }

    function symbol() external view returns (string memory) {
        return string.concat("KIT", PotUtil.u2s(receiptId()));
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        _transfer(msg.sender, to, amount);
        return true;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 allowed = allowance[from][msg.sender];
        if (allowed != type(uint256).max) {
            req(allowed >= amount, "allowance");
            unchecked { allowance[from][msg.sender] = allowed - amount; }
        }
        _transfer(from, to, amount);
        return true;
    }

    function burnFrom(address from, uint256 amount) external {
        req(msg.sender == vault, "not vault");
        req(balanceOf[from] >= amount, "balance");
        unchecked {
            balanceOf[from] -= amount;
            _meta -= amount << 96; // amount <= balance <= totalSupply
        }
        emit Transfer(from, address(0), amount);
    }

    function _transfer(address from, address to, uint256 amount) internal {
        req(to != address(0), "zero");
        req(balanceOf[from] >= amount, "balance");
        unchecked { // total supply < 2^160, so no balance can overflow
            balanceOf[from] -= amount;
            balanceOf[to] += amount;
        }
        emit Transfer(from, to, amount);
    }
}
