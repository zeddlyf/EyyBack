/**
 * Bank Code Mappings for Xendit Payouts
 * 
 * Maps user-friendly bank names to Xendit channel codes
 * Reference: https://xendit.co/developers/#payout-channels
 */

// Mapping of user inputs to Xendit channel codes
const BANK_CODE_MAP = {
  // BPI
  'BPI': 'BPI',
  'BPI_VA': 'BPI_VA',
  
  // BDO
  'BDO': 'BDO',
  'BDO_VA': 'BDO_VA',
  
  // Metrobank
  'MBANK': 'MBANK',
  'MBANK_VA': 'MBANK_VA',
  
  // PNB
  'PNB': 'PNB',
  'PNB_VA': 'PNB_VA',
  
  // RCBC
  'RCBC': 'RCBC',
  'RCBC_VA': 'RCBC_VA',
  
  // UnionBank
  'UNIONBANK': 'UNIONBANK',
  'UNIONBANK_VA': 'UNIONBANK_VA',
  
  // Landbank
  'LBP': 'LBP',
  'LANDBANK': 'LBP',
  
  // DBP
  'DBP': 'DBP',
  
  // UCPB
  'UCPB': 'UCPB',
  
  // China Bank
  'CHINABANK': 'CHINABANK',
  
  // Maybank
  'MAYBANK': 'MAYBANK',
  
  // CIMB
  'CIMB': 'CIMB',
  'CIMB_VA': 'CIMB_VA',
  
  // Security Bank
  'SECURITYBANK': 'SECURITYBANK',
  'SECURITYBANK_VA': 'SECURITYBANK_VA',
  
  // AUB
  'AUB': 'AUB',
  
  // Robinsons Bank
  'ROBINSONSBANK': 'ROBINSONSBANK',
  
  // Banco de Oro (alternative spelling)
  'BDO_UNIBANK': 'BDO',
  
  // E-Wallets and Payment Methods (Payout compatible)
  'GCASH': 'GCASH',
  'PAYMAYA': 'PAYMAYA',
  'PAYMAYA_POSTPAID': 'PAYMAYA_POSTPAID',
  'GRABPAY': 'GRABPAY',
  'DANA': 'DANA',
  'LINKAJA': 'LINKAJA',
  'BOOST': 'BOOST',
  'TOUCH_N_GO': 'TOUCH_N_GO',
  'PROMPTPAY': 'PROMPTPAY',
  'VIETTELPAY': 'VIETTELPAY',
  'ALIPAY': 'ALIPAY',
  'WECHAT': 'WECHAT',
  'KAKAO_PAY': 'KAKAO_PAY',
  'OVO': 'OVO'
};

/**
 * Convert user-friendly bank name to Xendit channel code
 * @param {string} bankName - User input bank name (e.g., "BPI", "BDO", "GCASH")
 * @returns {string} - Xendit channel code
 * @throws {Error} - If bank name is not supported
 */
function getBankChannelCode(bankName) {
  if (!bankName) {
    throw new Error('Bank name is required');
  }

  // Normalize input: trim and uppercase
  const normalized = bankName.trim().toUpperCase();

  // Look up in mapping
  const channelCode = BANK_CODE_MAP[normalized];

  if (!channelCode) {
    throw new Error(`Unsupported bank code: ${bankName}. Supported banks: ${Object.keys(BANK_CODE_MAP).join(', ')}`);
  }

  return channelCode;
}

/**
 * Get list of all supported banks
 * @returns {Array<string>} - List of supported bank codes
 */
function getSupportedBanks() {
  return Object.keys(BANK_CODE_MAP);
}

/**
 * Check if a bank code is supported
 * @param {string} bankName - Bank name to check
 * @returns {boolean} - True if bank is supported
 */
function isSupportedBank(bankName) {
  if (!bankName) return false;
  const normalized = bankName.trim().toUpperCase();
  return !!BANK_CODE_MAP[normalized];
}

/**
 * Validate bank details for payout
 * @param {object} bankDetails - Bank details object
 * @param {string} bankDetails.bankCode - Bank code
 * @param {string} bankDetails.accountNumber - Account number
 * @param {string} bankDetails.accountHolderName - Account holder name
 * @returns {object} - { valid: boolean, error: string|null, channelCode: string|null }
 */
function validateBankDetails(bankDetails) {
  const { bankCode, accountNumber, accountHolderName } = bankDetails;

  // Validate bank code
  if (!bankCode || typeof bankCode !== 'string') {
    return { valid: false, error: 'Bank code is required', channelCode: null };
  }

  if (!isSupportedBank(bankCode)) {
    return { 
      valid: false, 
      error: `Unsupported bank: ${bankCode}. Supported: ${getSupportedBanks().slice(0, 10).join(', ')}...`, 
      channelCode: null 
    };
  }

  // Validate account number
  if (!accountNumber || typeof accountNumber !== 'string') {
    return { valid: false, error: 'Account number is required', channelCode: null };
  }

  if (accountNumber.trim().length < 8) {
    return { valid: false, error: 'Account number must be at least 8 digits', channelCode: null };
  }

  // Validate account holder name
  if (!accountHolderName || typeof accountHolderName !== 'string') {
    return { valid: false, error: 'Account holder name is required', channelCode: null };
  }

  if (accountHolderName.trim().length < 2) {
    return { valid: false, error: 'Account holder name must be at least 2 characters', channelCode: null };
  }

  // Get channel code
  const channelCode = getBankChannelCode(bankCode);

  return { valid: true, error: null, channelCode };
}

module.exports = {
  getBankChannelCode,
  getSupportedBanks,
  isSupportedBank,
  validateBankDetails,
  BANK_CODE_MAP
};
