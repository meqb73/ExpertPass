import { getAddress, type Address } from 'viem'
import { USDC_DECIMALS, getUsdc } from '@/onchain-facts'
import { CHAIN_ID } from './network'

export { APP_CHAIN, CHAIN_ERROR, CHAIN_ID, IS_MAINNET, NETWORK_NAME } from './network'

const rawAddress = import.meta.env.VITE_EXPERTPASS_ADDRESS as string | undefined
export const EXPERT_PASS_ADDRESS: Address | undefined = rawAddress ? getAddress(rawAddress) : undefined

const usdcFact = getUsdc(CHAIN_ID)
if (!usdcFact) throw new Error(`USDC is not registered for chain ${CHAIN_ID}`)
export const USDC_ADDRESS = usdcFact.address as Address
export { USDC_DECIMALS }

export interface Category {
  id: number
  label: string
  short: string
}

export const CATEGORIES: Category[] = [
  { id: 0, label: 'Technology & Engineering', short: 'Tech' },
  { id: 1, label: 'Medicine & Health', short: 'Health' },
  { id: 2, label: 'Business & Finance', short: 'Finance' },
  { id: 3, label: 'Design & Creative', short: 'Design' },
  { id: 4, label: 'Marketing & Growth', short: 'Marketing' },
  { id: 5, label: 'Education & Skills', short: 'Education' },
  { id: 6, label: 'Legal & Compliance', short: 'Legal' },
  { id: 7, label: 'Other', short: 'Other' },
]

export const categoryLabel = (id: number) => CATEGORIES[id]?.label ?? 'Other'

/** Soft accent per category, used for cover placeholders. Values are hue angles. */
export const CATEGORY_HUE = [212, 160, 38, 300, 340, 190, 260, 220]
