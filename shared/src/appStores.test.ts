import { describe, expect, it } from 'vitest'
import { APP_SIGN_URL, phoneKind, storeFor } from './appStores'
import { APP_STORE_URL, PLAY_STORE_URL } from './brand'

describe('the app sign’s link', () => {
  it('sends an iPhone or an iPad to the App Store, an Android phone to Google Play, and a computer to the page', () => {
    const iphone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.1 Mobile/15E148 Safari/604.1'
    const ipad = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.1 Safari/605.1.15'
    const android = 'Mozilla/5.0 (Linux; Android 16; SM-S921U) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36'
    expect(phoneKind(iphone)).toBe('ios')
    // An iPad asks for the desktop site: it says it's a Mac, with a touch screen.
    expect(phoneKind(ipad, 5)).toBe('ios')
    expect(phoneKind(ipad, 0)).toBe('other')
    expect(phoneKind(android)).toBe('android')
    expect(storeFor('ios')).toBe(APP_STORE_URL)
    expect(storeFor('android')).toBe(PLAY_STORE_URL)
    expect(storeFor('other')).toBeNull()
    expect(APP_SIGN_URL).toBe('https://skyarcacademy.com/get-app?go')
  })
})
