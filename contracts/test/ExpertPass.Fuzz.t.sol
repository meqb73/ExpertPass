// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ExpertPassTestBase} from "./ExpertPass.Base.t.sol";
import {ExpertPass} from "../ExpertPass.sol";

contract ExpertPassFuzzTest is ExpertPassTestBase {
    /// price * sold fee split: net + fee == gross, fee <= gross * feeBps / 10000, funds fully distributed.
    function testFuzz_FeeArithmetic(uint128 price, uint16 feeBps_, uint8 soldCount) public {
        price = uint128(bound(price, 0, 1_000_000e6));
        feeBps_ = uint16(bound(feeBps_, 0, 1000));
        uint256 n = bound(soldCount, 0, 40);

        vm.prank(owner);
        pass.setFeeBps(feeBps_);
        uint256 id = _create(price, 100, false);

        for (uint256 i; i < n; ++i) {
            address buyer = address(uint160(0xA000 + i));
            _fund(buyer, price);
            _buy(buyer, id);
        }
        assertEq(usdc.balanceOf(address(pass)), uint256(price) * n);

        _toEnd();
        vm.prank(expert);
        pass.withdrawProceeds(id);

        uint256 gross = uint256(price) * n;
        uint256 expectedFee = gross * feeBps_ / 10000;
        assertEq(pass.accruedFees(), expectedFee);
        assertEq(usdc.balanceOf(expert), gross - expectedFee);
        assertLe(pass.accruedFees(), gross / 10); // never above 10%
        // nothing lost or created
        assertEq(usdc.balanceOf(expert) + usdc.balanceOf(address(pass)), gross);

        vm.prank(owner);
        pass.withdrawFees(treasury);
        assertEq(usdc.balanceOf(treasury), expectedFee);
        assertEq(usdc.balanceOf(address(pass)), 0);
    }

    /// Fee changes after creation never alter an existing session's snapshot.
    function testFuzz_FeeSnapshotImmutable(uint16 later) public {
        later = uint16(bound(later, 0, 1000));
        uint256 id = _create(PRICE, 5, false);
        vm.prank(owner);
        pass.setFeeBps(later);
        assertEq(pass.getSession(id).feeBps, FEE);
    }

    /// Any setFeeBps above the cap reverts.
    function testFuzz_SetFeeBpsCap(uint16 fee) public {
        vm.prank(owner);
        if (fee > 1000) {
            vm.expectRevert(ExpertPass.FeeTooHigh.selector);
            pass.setFeeBps(fee);
        } else {
            pass.setFeeBps(fee);
            assertEq(pass.feeBps(), fee);
        }
    }

    /// Cancel + refund returns exactly what was paid for every price.
    function testFuzz_RefundReturnsExactPrice(uint128 price) public {
        price = uint128(bound(price, 0, 1_000_000e6));
        uint256 id = _create(price, 5, false);
        _fund(alice, price);
        _buy(alice, id);
        vm.prank(expert);
        pass.cancelSession(id);
        assertEq(usdc.balanceOf(alice), price);
        assertEq(usdc.balanceOf(address(pass)), 0);
        assertEq(pass.balanceOf(alice, id), 0);
    }

    /// Buying is only possible strictly before start.
    function testFuzz_BuyWindow(uint64 t) public {
        uint256 id = _create(PRICE, 5, false);
        t = uint64(bound(t, T0, uint256(START) + 10 days));
        vm.warp(t);
        _fund(alice, PRICE);
        vm.prank(alice);
        if (t >= START) {
            vm.expectRevert(ExpertPass.SessionAlreadyStarted.selector);
        }
        pass.buyTicket(id);
    }

    /// Payout is only possible at or after start + duration.
    function testFuzz_PayoutWindow(uint32 duration, uint64 t) public {
        duration = uint32(bound(duration, 5 minutes, 30 days));
        vm.prank(expert);
        uint256 id = pass.createSession("t", "d", 0, PRICE, 5, START, duration, false, LINK, "");
        t = uint64(bound(t, T0, uint256(START) + 31 days));
        vm.warp(t);
        vm.prank(expert);
        if (t < uint256(START) + duration) {
            vm.expectRevert(ExpertPass.SessionNotEnded.selector);
        }
        pass.withdrawProceeds(id);
    }
}
