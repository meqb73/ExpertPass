// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {ExpertPassTestBase} from "./ExpertPass.Base.t.sol";
import {ExpertPass} from "../ExpertPass.sol";
import {MockUSDC} from "./MockUSDC.sol";

/// Fuzz: for any buyer count 1..120 the escrow always covers (sold - refunded) * price.
contract ExpertPassRefundAccountingFuzzTest is ExpertPassTestBase {
    /// forge-config: default.fuzz.runs = 64
    function testFuzz_CancelAccounting_AnyBuyerCount(uint256 n, uint256 priceSeed, uint256 chunkSeed, bool transferable)
        public
    {
        n = bound(n, 1, 120);
        uint128 price = uint128(bound(priceSeed, 0, 1_000e6));
        uint256 id = _create(price, 120, transferable);
        _buyMany(id, 0, n, price);
        assertEq(usdc.balanceOf(address(pass)), n * uint256(price));

        _cancel(id);

        uint256 auto_ = n < 40 ? n : 40;
        ExpertPass.Session memory s = pass.getSession(id);
        assertEq(s.sold, n);
        assertEq(s.refunded, auto_, "auto refunds capped at 40");
        assertEq(pass.refundsPending(id), n - auto_);
        assertEq(usdc.balanceOf(address(pass)), (n - auto_) * uint256(price));
        assertGe(usdc.balanceOf(address(pass)), (uint256(s.sold) - s.refunded) * price);

        // finish with arbitrary chunk sizes; escrow covers outstanding tickets at every step
        uint256 steps;
        while (pass.refundsPending(id) != 0) {
            chunkSeed = uint256(keccak256(abi.encode(chunkSeed)));
            pass.processRefunds(id, bound(chunkSeed, 1, 100));
            s = pass.getSession(id);
            assertGe(usdc.balanceOf(address(pass)), (uint256(s.sold) - s.refunded) * price);
            assertLt(++steps, 125);
        }

        s = pass.getSession(id);
        assertEq(s.refunded, n);
        assertEq(usdc.balanceOf(address(pass)), 0);
        for (uint256 i; i < n; i += (n > 12 ? 7 : 1)) {
            assertEq(usdc.balanceOf(_buyer(i)), price, "exact USDC back");
            assertEq(pass.balanceOf(_buyer(i), id), 0);
            assertEq(pass.refundedAmount(id, _buyer(i)), price);
        }
    }
}

/// Handler driving purchases, transfers, cancels, batch and pull refunds over 70 actors.
contract RefundHandler is Test {
    ExpertPass public pass;
    MockUSDC public usdc;
    address public expert;
    uint256 public constant ACTORS = 70;
    uint256[] public ids;
    uint256 public nextBuyer;

    constructor(ExpertPass pass_, MockUSDC usdc_, address expert_, uint256[] memory ids_) {
        pass = pass_;
        usdc = usdc_;
        expert = expert_;
        ids = ids_;
        for (uint256 i; i < ACTORS; ++i) {
            address a = actor(i);
            usdc_.mint(a, 1_000_000e6);
            vm.prank(a);
            usdc_.approve(address(pass_), type(uint256).max);
        }
    }

    function actor(uint256 i) public pure returns (address) {
        return address(uint160(0x300000 + i));
    }

    function _sid(uint256 s) internal view returns (uint256) {
        return ids[s % ids.length];
    }

    /// Next `n` fresh actors each buy one ticket of the chosen session.
    function buyBatch(uint256 s, uint256 n) external {
        n = bound(n, 1, 25);
        uint256 id = _sid(s);
        for (uint256 i; i < n; ++i) {
            vm.prank(actor((nextBuyer + i) % ACTORS));
            try pass.buyTicket(id) {} catch {}
        }
        nextBuyer += n;
    }

    function transfer(uint256 from, uint256 to, uint256 s) external {
        address f = actor(from % ACTORS);
        vm.prank(f);
        try pass.safeTransferFrom(f, actor(to % ACTORS), _sid(s), 1, "") {} catch {}
    }

    function cancel(uint256 s) external {
        vm.prank(expert);
        try pass.cancelSession(_sid(s)) {} catch {}
    }

    function processRefunds(uint256 s, uint256 max, uint256 caller) external {
        max = bound(max, 1, 100);
        vm.prank(actor(caller % ACTORS));
        try pass.processRefunds(_sid(s), max) {} catch {}
    }

    function pullRefund(uint256 a, uint256 s) external {
        vm.prank(actor(a % ACTORS));
        try pass.refund(_sid(s)) {} catch {}
    }
}

contract ExpertPassRefundInvariantTest is ExpertPassTestBase {
    RefundHandler internal handler;
    uint256[] internal ids;

    function setUp() public override {
        super.setUp();
        ids.push(_create(PRICE, 200, true));
        ids.push(_create(7e6, 200, false));
        ids.push(_create(0, 200, true));
        handler = new RefundHandler(pass, usdc, expert, ids);
        targetContract(address(handler));
    }

    /// PROPERTY: the contract balance equals what every session still owes (cancelled: unrefunded
    /// tickets * price; live: all sold tickets * price) — never less, so nobody is left unpaid.
    /// forge-config: default.invariant.runs = 32
    /// forge-config: default.invariant.depth = 60
    function invariant_BalanceCoversOutstandingRefunds() public view {
        uint256 owed;
        for (uint256 i; i < ids.length; ++i) {
            ExpertPass.Session memory s = pass.getSession(ids[i]);
            uint256 outstanding = s.cancelled ? uint256(s.sold) - s.refunded : s.sold;
            owed += outstanding * s.price;
        }
        assertEq(usdc.balanceOf(address(pass)), owed);
    }

    /// PROPERTY: tickets held == sold - refunded; refunded never exceeds sold.
    /// forge-config: default.invariant.runs = 32
    /// forge-config: default.invariant.depth = 60
    function invariant_OutstandingTicketsMatchCounters() public view {
        for (uint256 i; i < ids.length; ++i) {
            ExpertPass.Session memory s = pass.getSession(ids[i]);
            uint256 held;
            for (uint256 a; a < handler.ACTORS(); ++a) held += pass.balanceOf(handler.actor(a), ids[i]);
            assertEq(held, uint256(s.sold) - s.refunded);
            assertLe(s.refunded, s.sold);
        }
    }

    /// PROPERTY: the refund cursor never passes the participant list; pending is consistent.
    /// forge-config: default.invariant.runs = 32
    /// forge-config: default.invariant.depth = 60
    function invariant_CursorWithinParticipants() public view {
        for (uint256 i; i < ids.length; ++i) {
            uint256 id = ids[i];
            assertLe(pass.refundCursor(id), pass.participantCount(id));
            if (!pass.getSession(id).cancelled) {
                assertEq(pass.refundCursor(id), 0);
                assertEq(pass.refundsPending(id), 0);
            }
        }
    }

    /// PROPERTY: total refunded USDC recorded per holder equals refunded tickets * price.
    /// forge-config: default.invariant.runs = 32
    /// forge-config: default.invariant.depth = 60
    function invariant_RefundedAmountMatchesCounter() public view {
        for (uint256 i; i < ids.length; ++i) {
            ExpertPass.Session memory s = pass.getSession(ids[i]);
            uint256 sum;
            for (uint256 a; a < handler.ACTORS(); ++a) sum += pass.refundedAmount(ids[i], handler.actor(a));
            assertEq(sum, uint256(s.refunded) * s.price);
        }
    }
}
