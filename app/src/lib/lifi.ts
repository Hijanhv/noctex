import { createConfig, getRoutes } from '@lifi/sdk'

createConfig({ integrator: 'noctex' })

export interface SettlementQuoteParams {
  fromChain: number
  toChain: number
  fromToken: string
  toToken: string
  fromAmount: string
  fromAddress: string
}

export interface SettlementRoute {
  id: string
  fromAmount: string
  toAmount: string
  toAmountMin: string
  gasCostUSD: string
  steps: Array<{ toolDetails: { name: string; logoURI: string }; type: string }>
}

export async function getSettlementQuote(params: SettlementQuoteParams): Promise<SettlementRoute | null> {
  try {
    const result = await getRoutes({
      fromChainId: params.fromChain,
      toChainId: params.toChain,
      fromTokenAddress: params.fromToken,
      toTokenAddress: params.toToken,
      fromAmount: params.fromAmount,
      fromAddress: params.fromAddress,
      options: { slippage: 0.005, order: 'CHEAPEST' },
    })
    if (!result.routes.length) return null
    const r = result.routes[0]
    return {
      id: r.id,
      fromAmount: r.fromAmount,
      toAmount: r.toAmount,
      toAmountMin: r.toAmountMin,
      gasCostUSD: r.gasCostUSD ?? '—',
      steps: r.steps.map(s => ({ toolDetails: s.toolDetails, type: s.type })),
    }
  } catch {
    return null
  }
}

export async function executeSettlement(_routeId: string): Promise<string> {
  // Full LI.FI SDK execution requires a connected wallet signer.
  // This stub returns the route ID as a tracking reference.
  return _routeId
}
