// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ERC1155Holder} from "@openzeppelin/contracts/token/ERC1155/utils/ERC1155Holder.sol";
import {ExpertPass} from "../ExpertPass.sol";

/// @dev 6-decimal ERC-20 whose `transfer` to a blacklisted recipient reverts (mode 1) or returns false (mode 2).
///      transferFrom is untouched so blacklisted users can still buy before being blocked.
contract BlockableUSDC is ERC20 {
    mapping(address => uint8) public blockMode;

    constructor() ERC20("Blockable USDC", "bUSDC") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function setBlock(address who, uint8 mode) external {
        blockMode[who] = mode;
    }

    function transfer(address to, uint256 value) public override returns (bool) {
        uint8 m = blockMode[to];
        if (m == 1) revert("blacklisted");
        if (m == 2) return false;
        return super.transfer(to, value);
    }
}

/// @dev Contract buyer that can start rejecting every ERC-1155 receipt after purchase.
contract ToggleReceiver is ERC1155Holder {
    bool public reject;

    function setReject(bool r) external {
        reject = r;
    }

    function buy(ExpertPass p, IERC20 u, uint256 id, uint256 price) external {
        u.approve(address(p), price);
        p.buyTicket(id);
    }

    function onERC1155Received(address operator, address from, uint256 id, uint256 value, bytes memory data)
        public
        override
        returns (bytes4)
    {
        require(!reject, "receiver rejects");
        return super.onERC1155Received(operator, from, id, value, data);
    }
}
