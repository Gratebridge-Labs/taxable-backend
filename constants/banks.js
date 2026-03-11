/**
 * Nigerian banks list for upload UI (bank statement selection).
 * Logo URLs from https://nigerianbanklogos.xyz/ (NBL) — see https://nigerianbanklogos.xyz/docs for API.
 * IDs are used as keys when uploading statements (selectedBanks, bankId).
 */
const NBL_BASE = 'https://nigerianbanklogos.xyz/library';

const NIGERIAN_BANKS = [
  { id: 'access', name: 'Access Bank', logo: `${NBL_BASE}/accesscorp.svg` },
  { id: 'citibank', name: 'Citibank Nigeria', logo: null },
  { id: 'ecobank', name: 'Ecobank Nigeria', logo: `${NBL_BASE}/eti.svg` },
  { id: 'fidelity', name: 'Fidelity Bank', logo: `${NBL_BASE}/fidelity.svg` },
  { id: 'firstbank', name: 'First Bank of Nigeria', logo: `${NBL_BASE}/firstholdco.svg` },
  { id: 'fcmb', name: 'First City Monument Bank (FCMB)', logo: `${NBL_BASE}/fcmb.svg` },
  { id: 'globus', name: 'Globus Bank', logo: null },
  { id: 'gtbank', name: 'Guaranty Trust Bank (GTBank)', logo: `${NBL_BASE}/gtco.svg` },
  { id: 'heritage', name: 'Heritage Bank', logo: null },
  { id: 'jaiz', name: 'Jaiz Bank', logo: `${NBL_BASE}/jaizbank.svg` },
  { id: 'keystone', name: 'Keystone Bank', logo: null },
  { id: 'kuda', name: 'Kuda Bank', logo: null },
  { id: 'polaris', name: 'Polaris Bank', logo: null },
  { id: 'providus', name: 'Providus Bank', logo: null },
  { id: 'stanbic', name: 'Stanbic IBTC Bank', logo: `${NBL_BASE}/stanbic.svg` },
  { id: 'standard_chartered', name: 'Standard Chartered Bank', logo: null },
  { id: 'sterling', name: 'Sterling Bank', logo: `${NBL_BASE}/sterlingng.svg` },
  { id: 'suntrust', name: 'Suntrust Bank', logo: null },
  { id: 'union', name: 'Union Bank of Nigeria', logo: null },
  { id: 'uba', name: 'United Bank for Africa (UBA)', logo: `${NBL_BASE}/uba.svg` },
  { id: 'unity', name: 'Unity Bank', logo: `${NBL_BASE}/unitybnk.svg` },
  { id: 'wema', name: 'Wema Bank', logo: `${NBL_BASE}/wemabank.svg` },
  { id: 'zenith', name: 'Zenith Bank', logo: `${NBL_BASE}/zenithbank.svg` },
  // Additional commercial banks from NBL
  { id: 'abbey_mortgage', name: 'Abbey Mortgage Bank', logo: `${NBL_BASE}/abbeybds.svg` },
  { id: 'livingtrust', name: 'Livingtrust Mortgage Bank', logo: `${NBL_BASE}/livingtrust.svg` },
  { id: 'npf_microfinance', name: 'NPF Microfinance Bank', logo: `${NBL_BASE}/npfmcrfbk.svg` },
  { id: 'aso_savings', name: 'ASO Savings and Loans', logo: `${NBL_BASE}/asosavings.svg` }
];

module.exports = { NIGERIAN_BANKS };
