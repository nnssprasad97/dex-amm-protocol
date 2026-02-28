# DEX AMM Protocol

## Overview
A decentralized exchange (DEX) implementing the Automated Market Maker (AMM) model using the constant product formula (`x * y = k`). It provides liquidity provision, dynamic pricing, proportional token returns during liquidity removal, and 0.3% swaps. This project demonstrates core functional knowledge of DeFi primitives based closely on Uniswap V2 mechanics.

## Features
- **Liquidity Management:** Add and remove liquidity seamlessly, receiving LP tokens proportional to exact share of reserves.
- **Constant Product Swaps:** Instantly trade Token A for Token B (and vice-versa) along the `x * y = k` pricing curve without counter-parties.
- **Dynamic Pricing:** Real-time spot price queries reflecting changes after transactions.
- **Fee Accumulation:** 0.3% fee collected on all swaps and automatically distributed proportionally among liquidity providers. 
- **Security:** Checks for non-zero transactions and uses ReentrancyGuard for interaction safety.

## Architecture
The protocol contains two primary smart contracts:
- `DEX.sol`: The core Automated Market Maker implementation. It manages liquidity pools, LP minting/burning, and fee-inclusive token swaps. Inherits from OpenZeppelin's `ERC20` (for LP tokens) and `ReentrancyGuard`.
- `MockERC20.sol`: A simple test token implementing the ERC20 standard and a basic mint function purely for generating test tokens in the Hardhat local environment.

## Mathematical Implementation

### Constant Product Formula
The core invariant maintained by the protocol pool is:
`x * y = k`
Where `x` and `y` are the respective quantities of Token A and Token B in the pool, and `k` is a constant. When trading, the user alters the ratio of `x` and `y` without decreasing `k`.

### Fee Calculation
Trades deduct a `0.3%` fee which remains in the pool, increasing the total value of the reserves (thus expanding `k`). The precise `getAmountOut` calculation performed for all swaps uses this formula to ensure integer accuracy:
`amountInWithFee = amountIn * 997`
`amountOut = (amountInWithFee * reserveOut) / ((reserveIn * 1000) + amountInWithFee)`

### LP Token Minting
Liquidity providers who supply tokens receive "LP Tokens" (symbol `DEX-LP`). 
- **First Liquidity Provider:** `liquidityMinted = sqrt(amountA * amountB)`
- **Subsequent Liquidity Providers:** `liquidityMinted = min((amountA * totalSupply) / reserveA, (amountB * totalSupply) / reserveB)`

Liquidity removal returns tokens proportionally:
`amountToReturn = (liquidityAmount * reserveTotal) / totalSupply`

## Setup Instructions

### Prerequisites
- Node.js
- Docker & Docker Compose (Optional but recommended for execution)

### Docker Environment

1. Build and boot the environment
```sh
docker-compose up -d
```
2. Compile the Smart Contracts
```sh
docker-compose exec app npm run compile
```
3. Run Test Suite
```sh
docker-compose exec app npm test
```
4. Verify Test Coverage
```sh
docker-compose exec app npm run coverage
```

### Local Environment
If you prefer running outside Docker, run these equivalent Hardhat commands:
```sh
npm install
npx hardhat compile
npx hardhat test
```

## Contract Addresses
This project is currently for local evaluation via Hardhat and has not been deployed to any public testnet. It can be easily deployed by providing the addresses of two legitimate ERC20 tokens in `scripts/deploy.js`.

## Known Limitations
- Implements only a single trading pair configuration per `DEX.sol` instance. Expanding to a factory system would allow infinite pair creation.
- No `minAmountOut` slippage protection mechanisms in the swap functions. Callers must handle maximum acceptable slippage natively or wrap the DEX inside a router contract.
- Minimal Oracle implementation: The protocol does not accumulate price over time (TWAP) and therefore relies solely on spot `getPrice` functions which are susceptible to flash loan manipulation.
- Lacks a deadline modifier, meaning queued transactions can be mined far into the future when price ratios have shifted drastically.

## Security Considerations
- **Inherited Standards:** Uses highly-audited OpenZeppelin `SafeERC20` wrapper patterns minimizing unpredictable return value bugs on transfers.
- **Reentrancy Protections:** Crucial state modifications are ordered before external token transfers (following Checks-Effects-Interactions) alongside strict enforcement of `ReentrancyGuard` `nonReentrant` modifiers.
- **Pre-computed Overflows:** Developed on Solidity ^0.8.0, capitalizing on native overflow and underflow panics without `SafeMath` requirements. 
- **Proportional Checks:** Zero-amount inputs rigorously revert to save computational gas costs across all endpoints.
