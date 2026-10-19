// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {req} from "./PotUtil.sol";

/// @title TestUSD — worthless 6-decimal test stablecoin for PotKit demos on testnet.
/// @notice Anyone can mint up to FAUCET_CAP per call. Never use on a real network.
contract TestUSD {
    string public constant name = "PotKit Test USD";
    string public constant symbol = "tUSD";
    uint8 public constant decimals = 6;
    uint256 public constant FAUCET_CAP = 10_000 * 1e6;
    uint256 public totalSupply;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    function faucet(uint256 amount) external {
        req(amount > 0 && amount <= FAUCET_CAP, "faucet cap");
        totalSupply += amount;
        unchecked { balanceOf[msg.sender] += amount; } // <= totalSupply
        emit Transfer(address(0), msg.sender, amount);
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

    function _transfer(address from, address to, uint256 amount) internal {
        req(to != address(0), "zero");
        req(balanceOf[from] >= amount, "balance");
        unchecked { // balances sum to totalSupply, so none can overflow
            balanceOf[from] -= amount;
            balanceOf[to] += amount;
        }
        emit Transfer(from, to, amount);
    }
}
