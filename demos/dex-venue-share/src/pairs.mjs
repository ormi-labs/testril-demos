const usdcPools = {
  v2: "0xb4e16d0168e52d35cacd2c6185b44281ec28c9dc",
  v3Fee100: "0xe0554a476a092703abdb3ef35c80e0d76d32939f",
  v3Fee500: "0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640",
  v3Fee3000: "0x8ad599c3a0ff1de082011efddc58f1908eb6e6d8",
  v3Fee10000: "0x7bea39867e4169dbe237d55c8242a8f2fcdcc387",
  v4: "0x21c67e77068de97969ba93d4aab21826d33ca12bb9f565d8496e8fda8a82ca27",
  curve: "0x7f86bf177dd4f3494b841a37e810a34dd56c829b",
  fluid: "0x2886a01a0645390872a9eb99dae1283664b0c524",
};
const wstethPools = {
  v3: "0x109830a1aaad605bbf02a9dfa7b0b92ec2fb7daa",
  fluid: "0x0b1a513ee24972daef112bc777a5610d4325c9e7",
};

// `eth` and `other` name the row field holding each side. Fluid and Uniswap v2
// and v3 sort tokens by address: USDC and wstETH sort before WETH and the
// 0xEeee native-ETH sentinel; v4 sorts native ETH (address 0) first. Curve rows
// are per coin index and cannot isolate one pair, so its subject has no `other`
// side: it counts all WETH volume of the tricrypto pool and skips price checks.
export const pairs = [
  {
    id: "eth-usdc",
    title: "ETH / USDC",
    otherDecimals: 6,
    perEthMilli: { min: 500_000n, max: 20_000_000n },
    subjects: [
      {
        venue: "Uniswap v2",
        bind: "uniswap-v2",
        pool: usdcPools.v2,
        eth: "volume1",
        other: "volume0",
      },
      {
        venue: "Uniswap v3",
        bind: "uniswap-v3",
        pool: usdcPools.v3Fee500,
        eth: "volume1",
        other: "volume0",
        tier: "0.05%",
      },
      {
        venue: "Uniswap v3",
        bind: "uniswap-v3",
        pool: usdcPools.v3Fee3000,
        eth: "volume1",
        other: "volume0",
        tier: "0.3%",
      },
      {
        venue: "Uniswap v3",
        bind: "uniswap-v3",
        pool: usdcPools.v3Fee100,
        eth: "volume1",
        other: "volume0",
        tier: "0.01%",
      },
      {
        venue: "Uniswap v3",
        bind: "uniswap-v3",
        pool: usdcPools.v3Fee10000,
        eth: "volume1",
        other: "volume0",
        tier: "1%",
      },
      {
        venue: "Uniswap v4",
        bind: "uniswap-v4",
        pool: usdcPools.v4,
        eth: "volume0",
        other: "volume1",
      },
      { venue: "Curve", bind: "curve", pool: usdcPools.curve, eth: "coin:2" },
      {
        venue: "Fluid",
        bind: "fluid-dex",
        pool: usdcPools.fluid,
        eth: "volume1",
        other: "volume0",
      },
    ],
  },
  {
    id: "wsteth-eth",
    title: "wstETH / ETH",
    otherDecimals: 18,
    perEthMilli: { min: 500n, max: 1_000n },
    subjects: [
      {
        venue: "Uniswap v3",
        bind: "uniswap-v3",
        pool: wstethPools.v3,
        eth: "volume1",
        other: "volume0",
        tier: "0.01%",
      },
      {
        venue: "Fluid",
        bind: "fluid-dex",
        pool: wstethPools.fluid,
        eth: "volume1",
        other: "volume0",
      },
    ],
  },
];
