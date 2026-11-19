// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {ExpertPassTestBase} from "./ExpertPass.Base.t.sol";
import {ExpertPass} from "../ExpertPass.sol";
import {MockUSDC} from "./MockUSDC.sol";

contract ExpertPassHandler is Test {
    ExpertPass public pass;
    MockUSDC public usdc;
    address public expert;
    address public owner;
    address public treasury;
    address[] public actors;
    uint256[] public sessionIds;

    constructor(
        ExpertPass pass_,
        MockUSDC usdc_,
        address expert_,
        address owner_,
        address treasury_,
        uint256[] memory ids
    ) {
        pass = pass_;
        usdc = usdc_;
        expert = expert_;
        owner = owner_;
        treasury = treasury_;
        sessionIds = ids;
        for (uint256 i; i < 5; ++i) {
            address a = makeAddr(string.concat("actor", vm.toString(i)));
            actors.push(a);
            usdc_.mint(a, 1_000_000e6);
            vm.prank(a);
            usdc_.approve(address(pass_), type(uint256).max);
        }
    }

    function _actor(uint256 s) internal view returns (address) {
        return actors[s % actors.length];
    }

    function _sid(uint256 s) internal view returns (uint256) {
        return sessionIds[s % sessionIds.length];
    }

    function buy(uint256 a, uint256 s) external {
        vm.prank(_actor(a));
        try pass.buyTicket(_sid(s)) {} catch {}
    }

    function transfer(uint256 from, uint256 to, uint256 s) external {
        address f = _actor(from);
        vm.prank(f);
        try pass.safeTransferFrom(f, _actor(to), _sid(s), 1, "") {} catch {}
    }

    function cancel(uint256 s) external {
        vm.prank(expert);
        try pass.cancelSession(_sid(s)) {} catch {}
    }

    function refund(uint256 a, uint256 s) external {
        vm.prank(_actor(a));
        try pass.refund(_sid(s)) {} catch {}
    }

    function withdrawProceeds(uint256 s) external {
        vm.prank(expert);
        try pass.withdrawProceeds(_sid(s)) {} catch {}
    }

    function withdrawFees() external {
        vm.prank(owner);
        try pass.withdrawFees(treasury) {} catch {}
    }

    function setFee(uint16 fee) external {
        fee = uint16(bound(fee, 0, 1000));
        vm.prank(owner);
        pass.setFeeBps(fee);
    }

    function passTime(uint256 dt) external {
        skip(bound(dt, 0, 8 hours));
    }
}

contract ExpertPassInvariantTest is ExpertPassTestBase {
    ExpertPassHandler internal handler;
    uint256[] internal ids;

    function setUp() public override {
        super.setUp();
        ids.push(_create(PRICE, 3, true));
        ids.push(_create(7e6, 4, false));
        ids.push(_create(0, 3, true));
        ids.push(_create(123_456, 2, true));
        handler = new ExpertPassHandler(pass, usdc, expert, owner, treasury, ids);
        targetContract(address(handler));
    }

    /// Escrow owed to buyers/experts that has not yet left the contract.
    function _escrow() internal view returns (uint256 total) {
        uint256 n = pass.sessionCount();
        for (uint256 i = 1; i <= n; ++i) {
            ExpertPass.Session memory s = pass.getSession(i);
            if (s.cancelled) {
                total += uint256(s.price) * (s.sold - s.refunded);
            } else if (!s.paidOut) {
                total += uint256(s.price) * s.sold;
            }
        }
    }

    /// PROPERTY: the contract can always pay every liability (unpaid escrow + accrued fees).
    function invariant_UsdcCoversEscrowAndFees() public view {
        assertGe(usdc.balanceOf(address(pass)), _escrow() + pass.accruedFees());
    }

    /// PROPERTY: with no foreign deposits, backing is exact (nothing leaks or gets stuck).
    function invariant_UsdcExactlyMatchesLiabilities() public view {
        assertEq(usdc.balanceOf(address(pass)), _escrow() + pass.accruedFees());
    }

    /// PROPERTY: outstanding tickets == sold - refunded for every session.
    function invariant_TicketSupplyMatchesAccounting() public view {
        uint256 n = pass.sessionCount();
        for (uint256 i = 1; i <= n; ++i) {
            ExpertPass.Session memory s = pass.getSession(i);
            uint256 held;
            for (uint256 a; a < 5; ++a) held += pass.balanceOf(handler.actors(a), i);
            assertEq(held, uint256(s.sold) - s.refunded);
            assertLe(s.sold, s.supply);
        }
    }
}
