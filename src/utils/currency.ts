export async function convertUSDToINR(amountUSD: number): Promise<number> {
  try {
    const response = await fetch('https://api.exchangerate.host/latest?base=USD');
    const data = await response.json();
    const inrRate = data.rates.INR;
    return amountUSD * inrRate;
  } catch (error) {
    console.error('Error fetching exchange rate:', error);
    return amountUSD * 83;
  }
}

export function formatCurrency(amount: number, currency: 'INR' | 'USD'): string {
  if (currency === 'INR') {
    return `₹${amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  } else {
    return `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
}
