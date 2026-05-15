// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract AIGENTVault is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    IERC20 public immutable vestedToken;

    struct VestingSchedule {
        uint256 totalAmount;
        uint256 claimedAmount;
        uint64 startTime;
        uint64 cliffDuration;
        uint64 vestingDuration;
        bool revoked;
        bool exists;
    }
    mapping(address => VestingSchedule) public schedules;

    event VestingCreated(address indexed beneficiary, uint256 totalAmount, uint64 startTime, uint64 cliffDuration, uint64 vestingDuration);
    event Claimed(address indexed beneficiary, uint256 amount);
    event Revoked(address indexed beneficiary, uint256 unvestedAmount);

    constructor(address _vestedToken, address initialOwner) Ownable(initialOwner) {
        vestedToken = IERC20(_vestedToken);
    }

    function createVesting(
        address beneficiary,
        uint256 totalAmount,
        uint64 startTime,
        uint64 cliffDuration,
        uint64 vestingDuration
    ) external onlyOwner {
        require(beneficiary != address(0), "zero beneficiary");
        require(totalAmount > 0, "zero amount");
        require(!schedules[beneficiary].exists, "already exists");
        require(cliffDuration < vestingDuration, "cliff >= vesting");

        schedules[beneficiary] = VestingSchedule({
            totalAmount: totalAmount,
            claimedAmount: 0,
            startTime: startTime,
            cliffDuration: cliffDuration,
            vestingDuration: vestingDuration,
            revoked: false,
            exists: true
        });

        vestedToken.safeTransferFrom(msg.sender, address(this), totalAmount);
        emit VestingCreated(beneficiary, totalAmount, startTime, cliffDuration, vestingDuration);
    }

    function claim() external nonReentrant {
        VestingSchedule storage s = schedules[msg.sender];
        require(s.exists, "no schedule");
        require(!s.revoked, "revoked");

        uint256 releasable = _releasableAmount(s);
        require(releasable > 0, "nothing to claim");

        s.claimedAmount += releasable;
        vestedToken.safeTransfer(msg.sender, releasable);
        emit Claimed(msg.sender, releasable);
    }

    function revoke(address beneficiary) external onlyOwner {
        VestingSchedule storage s = schedules[beneficiary];
        require(s.exists, "no schedule");
        require(!s.revoked, "already revoked");

        s.revoked = true;
        uint256 vested = _vestedAmount(s);
        uint256 unvested = s.totalAmount - vested;
        if (unvested > 0) {
            vestedToken.safeTransfer(msg.sender, unvested);
        }
        emit Revoked(beneficiary, unvested);
    }

    function vestedAmount(address beneficiary) public view returns (uint256) {
        VestingSchedule storage s = schedules[beneficiary];
        if (!s.exists || s.revoked) return 0;
        return _vestedAmount(s);
    }

    function releasableAmount(address beneficiary) public view returns (uint256) {
        VestingSchedule storage s = schedules[beneficiary];
        if (!s.exists || s.revoked) return 0;
        return _releasableAmount(s);
    }

    function _vestedAmount(VestingSchedule storage s) private view returns (uint256) {
        uint64 now64 = uint64(block.timestamp);
        if (now64 < s.startTime + s.cliffDuration) return 0;
        if (now64 >= s.startTime + s.vestingDuration) return s.totalAmount;
        return (s.totalAmount * (now64 - s.startTime)) / s.vestingDuration;
    }

    function _releasableAmount(VestingSchedule storage s) private view returns (uint256) {
        return _vestedAmount(s) - s.claimedAmount;
    }
}
