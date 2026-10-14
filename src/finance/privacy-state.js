import { createContext, useContext } from 'react'
import { brl } from '../office/model'

export const Privacy = createContext({ hidden: false, toggle: () => {} })
export const useFinancePrivacy = () => useContext(Privacy)
export const money = cents => brl(cents).replace(/\u00a0/g, ' ')
export const signedMoney = cents => `${cents > 0 ? '+' : cents < 0 ? '−' : ''}${money(Math.abs(cents))}`
