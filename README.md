# DEX AMM Project

## Overview
A simplified Decentralized Exchange (DEX) implementing the Automated Market Maker (AMM) model using the constant product formula (x * y = k), similar to Uniswap V2.

## Features
- Initial and subsequent liquidity provision
- Liquidity removal with proportional share calculation
- Token swaps using constant product formula (x * y = k)
- 0.3% trading fee for liquidity providers
- LP token minting and burning

## Architecture
The project consists of a core DEX contract handling all pool logic and a mock ERC20 token for testing.
- `DEX.sol`: Manages reserves, liquidity, swaps, and pricing.
- `MockERC20.sol`: Simple ERC20 for creating test trading pairs.

## Mathematical Implementation

### Constant Product Formula
The invariant `x * y = k` is maintained, where `x` and `y` are the reserves of the two tokens. After a swap, the new reserves must satisfy `x_new * y_new >= k`.

### Fee Calculation
A 0.3% fee is applied to every trade. This is implemented by deducting the fee from the input amount before applying the constant product formula:`amountInWithFee = amountIn * 997`.

### LP Token Minting
- **Initial Liquidity**: `liquidity = sqrt(amountA * amountB)`
- **Subsequent Liquidity**: `liquidity = min((amountA * totalLiquidity) / reserveA, (amountB * totalLiquidity) / reserveB)`

## Setup Instructions

### Prerequisites
- Docker and Docker Compose installed
- Git

### Installation

1. Clone the repository:
```bash
git clone <your-repo-url>
cd dex-amm
```

2. Start Docker environment:
```bash
docker-compose up -d
```

3. Compile contracts:
```bash
docker-compose exec app npm run compile
```

4. Run tests:
```bash
docker-compose exec app npm test
```

5. Check coverage:
```bash
docker-compose exec app npm run coverage
```

6. Stop Docker:
```bash
docker-compose down
```

## Running Tests Locally (without Docker)
```bash
npm install
npm run compile
npm test
```

## Security Considerations
- Checks for zero amounts
- Overflow protection via Solidity >0.8
- Input validation for liquidity ratios

## Contract Addresses
Contracts are not deployed on a public testnet; all tests run on local Hardhat network.

## Known Limitations
- Single trading pair only per DEX instance.
- No price oracle implementation (only spot price via reserves).
- No built-in slippage protection (minAmountOut must be handled by caller).
- No deadline parameter for transaction expiry.
