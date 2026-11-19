// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC1155Holder} from "@openzeppelin/contracts/token/ERC1155/utils/ERC1155Holder.sol";
import {ExpertPass} from "../ExpertPass.sol";

interface IUSDCHook {
    function onUSDCReceived() external;
}

/// @dev Simple 6-decimal ERC-20 with an optional receive hook (to simulate token-callback reentrancy).
contract MockUSDC is ERC20 {
    address public hookTarget;

    constructor() ERC20("Mock USDC", "mUSDC") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function setHook(address target) external {
        hookTarget = target;
    }

    function _update(address from, address to, uint256 value) internal override {
        super._update(from, to, value);
        if (hookTarget != address(0) && to == hookTarget && from != address(0)) {
            IUSDCHook(to).onUSDCReceived();
        }
    }
}

/// @dev Ticket holder that tries to re-enter ExpertPass from callbacks and records the outcome.
contract MaliciousHolder is ERC1155Holder, IUSDCHook {
    enum Mode {
        None,
        BuyOnReceive,
        RefundOnReceive,
        MintCertsOnReceive,
        RefundOnUSDC
    }

    ExpertPass public immutable pass;
    MockUSDC public immutable usdc;
    Mode public mode;
    uint256 public targetId;
    bool public reentryAttempted;
    bool public reentrySucceeded;
    bytes public lastError;

    constructor(ExpertPass pass_, MockUSDC usdc_) {
        pass = pass_;
        usdc = usdc_;
    }

    function arm(Mode mode_, uint256 targetId_) external {
        mode = mode_;
        targetId = targetId_;
        reentryAttempted = false;
        reentrySucceeded = false;
        delete lastError;
    }

    function buy(uint256 id, uint256 price) external {
        usdc.approve(address(pass), price);
        pass.buyTicket(id);
    }

    function doRefund(uint256 id) external {
        pass.refund(id);
    }

    function onERC1155Received(address operator, address from, uint256 id, uint256 value, bytes memory data)
        public
        override
        returns (bytes4)
    {
        if (mode == Mode.BuyOnReceive) {
            reentryAttempted = true;
            try pass.buyTicket(targetId) {
                reentrySucceeded = true;
            } catch (bytes memory e) {
                lastError = e;
            }
        } else if (mode == Mode.RefundOnReceive) {
            reentryAttempted = true;
            try pass.refund(targetId) {
                reentrySucceeded = true;
            } catch (bytes memory e) {
                lastError = e;
            }
        } else if (mode == Mode.MintCertsOnReceive) {
            reentryAttempted = true;
            address[] memory r = new address[](1);
            r[0] = address(this);
            try pass.mintCertificates(targetId, r) {
                reentrySucceeded = true;
            } catch (bytes memory e) {
                lastError = e;
            }
        }
        return super.onERC1155Received(operator, from, id, value, data);
    }

    function onUSDCReceived() external override {
        if (mode == Mode.RefundOnUSDC) {
            reentryAttempted = true;
            try pass.refund(targetId) {
                reentrySucceeded = true;
            } catch (bytes memory e) {
                lastError = e;
            }
        }
    }
}

/// @dev Receiver that rejects every ERC-1155 transfer.
contract RejectingReceiver {
    function onERC1155Received(address, address, uint256, uint256, bytes calldata) external pure returns (bytes4) {
        return 0xdeadbeef;
    }
}
