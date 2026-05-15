// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title AIGENT Airdrop
/// @notice Free daily airdrop: 10,000 AIGENT per claim, first 100 wallets per UTC day
/// @dev 400M total allocated (80% of supply), 1M per day, one claim per address per day
contract AIGENTAirdrop is Ownable, ReentrancyGuard {
    IERC20 public immutable aigent;

    uint256 public constant CLAIM_AMOUNT = 10000 * 1e18;
    uint256 public constant DAILY_CLAIM_CAP = 100;
    uint256 public constant MAX_TOTAL = 400000000 * 1e18;

    // day index (UTC days since epoch) => number of claims today
    mapping(uint256 => uint256) public dailyClaimed;
    // day index => address => already claimed?
    mapping(uint256 => mapping(address => bool)) public claimed;

    uint256 public totalClaimed;

    event Claimed(address indexed user, uint256 amount, uint256 day);

    constructor(address _aigent) Ownable(msg.sender) {
        aigent = IERC20(_aigent);
    }

    function today() public view returns (uint256) {
        return block.timestamp / 1 days;
    }

    function remainingToday() public view returns (uint256) {
        uint256 c = dailyClaimed[today()];
        return c >= DAILY_CLAIM_CAP ? 0 : DAILY_CLAIM_CAP - c;
    }

    function hasClaimedToday(address user) public view returns (bool) {
        return claimed[today()][user];
    }

    function claim() external nonReentrant {
        uint256 d = today();
        require(dailyClaimed[d] < DAILY_CLAIM_CAP, "Daily cap reached");
        require(!claimed[d][msg.sender], "Already claimed today");
        require(totalClaimed + CLAIM_AMOUNT <= MAX_TOTAL, "Airdrop finished");

        claimed[d][msg.sender] = true;
        dailyClaimed[d]++;
        totalClaimed += CLAIM_AMOUNT;

        require(aigent.transfer(msg.sender, CLAIM_AMOUNT), "Transfer failed");
        emit Claimed(msg.sender, CLAIM_AMOUNT, d);
    }

    /// @notice Owner can recover remaining tokens if airdrop is discontinued
    function recoverTokens(address to) external onlyOwner {
        uint256 bal = aigent.balanceOf(address(this));
        require(bal > 0, "No balance");
        aigent.transfer(to, bal);
    }
}
