// Utility functions for converting hex values to human-readable formats

// Convert hex wei value to ETH (string)
export function weiToEth(hexWei: string): string {
  if (!hexWei || hexWei === '0x0' || hexWei === '0x') return '0';
  try {
    const wei = BigInt(hexWei);
    const eth = Number(wei) / 1e18;
    if (eth < 0.0001) return eth.toExponential(2);
    if (eth < 1) return eth.toFixed(4);
    return eth.toFixed(3);
  } catch {
    return '0';
  }
}

// Convert hex gas price to gwei
export function hexToGwei(hex: string): number {
  if (!hex || hex === '0x0' || hex === '0x') return 0;
  try {
    const wei = BigInt(hex);
    return Number(wei) / 1e9;
  } catch {
    return 0;
  }
}

// Convert hex to decimal number
export function hexToNumber(hex: string): number {
  if (!hex || hex === '0x0' || hex === '0x') return 0;
  try {
    return parseInt(hex, 16);
  } catch {
    return 0;
  }
}

// Format large numbers with commas
export function formatNumber(num: number): string {
  return num.toLocaleString('en-US');
}

// Get gas price color coding and label
export function getGasPriceLevel(gwei: number): { color: string; label: string; bg: string } {
  if (gwei < 30) return { color: 'text-green-400', label: 'LOW', bg: 'bg-green-400/10' };
  if (gwei < 50) return { color: 'text-yellow-400', label: 'MEDIUM', bg: 'bg-yellow-400/10' };
  return { color: 'text-red-400', label: 'HIGH', bg: 'bg-red-400/10' };
}

// Parse transaction input to determine type
export function parseTransactionType(input: string, to: string | null): string {
  if (!input || input === '0x') return 'ETH Transfer';

  // Common method signatures
  const methodSig = input.slice(0, 10).toLowerCase();

  const knownMethods: Record<string, string> = {
    '0xa9059cbb': 'Token Transfer',
    '0x23b872dd': 'Token Transfer From',
    '0x095ea7b3': 'Token Approval',
    '0x38ed1739': 'Uniswap V2 Swap',
    '0x7ff36ab5': 'Uniswap V2 Swap ETH',
    '0x128acb08': 'Uniswap V3 Swap',
    '0x5ae401dc': 'Uniswap V3 Multicall',
    '0x3593564c': 'Uniswap Universal Router',
    '0x6a761202': 'Flashbots Bundle',
    '0xac9650d8': 'Multicall',
  };

  return knownMethods[methodSig] || 'Contract Call';
}

// Calculate time ago from unix timestamp
export function timeAgo(timestamp: number): string {
  const now = Math.floor(Date.now() / 1000);
  const diff = now - timestamp;

  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

// Format slot to approximate time
export function slotToTime(slot: number): string {
  // Genesis: September 1, 2022, 12:00:00 PM UTC (merge)
  const genesisTime = 1662379200;
  const slotTime = genesisTime + (slot * 12);
  return new Date(slotTime * 1000).toLocaleString();
}

// Calculate epoch from slot
export function slotToEpoch(slot: number): number {
  return Math.floor(slot / 32);
}

// Shorten address for display
export function shortenAddress(address: string): string {
  if (!address || address.length < 10) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

// Shorten hash for display
export function shortenHash(hash: string): string {
  if (!hash || hash.length < 10) return hash;
  return `${hash.slice(0, 10)}...${hash.slice(-8)}`;
}

// Get known builder name
export function getBuilderName(pubkey: string): string {
  if (!pubkey) return 'Unknown';

  const knownBuilders: Record<string, string> = {
    '0xa1dead01e65f0a0eee7b5170223f20c8f0cbf122eac3324d61afbdb33a8885ff8cab2ef514ac2c7698ae0d6289ef27fc': 'Flashbots',
    '0xb3ee7afcf27f1f1259ac1787876318c6584ee353097a50ed84f51a1f21a323b3736f271a895c7ce918c038e4265918be': 'bloXroute Max Profit',
    '0xad0a8bb54565c2211cee576363f3a347089d2f07cf72679d16911d740262694cadb62d7fd7483f27afd714ca0f1b9118': 'bloXroute Regulated',
    '0xa7ab7a996c8584251c8f925da3170bdfd6ebc75d50f5ddc4050a6fdc77f2a3b5fce2cc750d0865e05d7228af97d69561': 'Titan',
    '0x98650e550200401aab7e': 'Agnostic Relay',
  };

  // Check for exact match
  if (knownBuilders[pubkey]) return knownBuilders[pubkey];

  // Check for partial match (first 20 chars)
  const prefix = pubkey.slice(0, 20);
  for (const [key, value] of Object.entries(knownBuilders)) {
    if (key.startsWith(prefix)) return value;
  }

  return shortenAddress(pubkey);
}

// Calculate gas efficiency percentage
export function gasEfficiency(used: string, limit: string): number {
  const usedNum = hexToNumber(used);
  const limitNum = hexToNumber(limit);
  if (limitNum === 0) return 0;
  return Math.round((usedNum / limitNum) * 100);
}

// Format USD value
export function formatUSD(amount: number): string {
  if (amount < 0.01) return `$${amount.toFixed(4)}`;
  if (amount < 1) return `$${amount.toFixed(2)}`;
  return `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// Get percentile indicator
export function getPercentile(value: number, values: number[]): string {
  if (values.length === 0) return '';
  const sorted = [...values].sort((a, b) => a - b);
  const index = sorted.findIndex(v => v >= value);
  if (index === -1) return 'top 100%';
  const percentile = Math.round((index / sorted.length) * 100);
  if (percentile <= 10) return '🔥 top 10%';
  if (percentile <= 25) return 'top 25%';
  if (percentile <= 50) return 'top 50%';
  return '';
}
