const AREA_3 = new Set([
  '220', '221', '223', '230', '236', '237', '249', '260', '261', '263', '264', '266', '280', '291',
  '294', '297', '298', '299', '336', '341', '342', '343', '344', '345', '348', '351', '353', '358',
  '362', '364', '370', '376', '379', '380', '381', '383', '385', '387', '388',
])

const AREA_4 = new Set([
  '2202', '2221', '2223', '2224', '2225', '2226', '2227', '2229', '2241', '2242', '2243', '2244',
  '2245', '2252', '2254', '2255', '2257', '2261', '2262', '2264', '2265', '2266', '2267', '2268',
  '2271', '2272', '2273', '2274', '2281', '2283', '2284', '2285', '2286', '2291', '2292', '2296',
  '2297', '2302', '2314', '2316', '2317', '2320', '2323', '2324', '2325', '2326', '2331', '2333',
  '2334', '2335', '2336', '2337', '2338', '2342', '2343', '2344', '2345', '2346', '2352', '2353',
  '2354', '2355', '2356', '2357', '2358', '2392', '2393', '2394', '2395', '2396', '2473', '2474',
  '2475', '2477', '2478', '2622', '2624', '2625', '2626', '2646', '2647', '2648', '2651', '2655',
  '2656', '2657', '2658', '2901', '2902', '2903', '2920', '2921', '2922', '2923', '2924', '2925',
  '2926', '2927', '2928', '2929', '2931', '2932', '2933', '2934', '2935', '2936', '2942', '2945',
  '2946', '2948', '2952', '2953', '2954', '2962', '2963', '2964', '2966', '2972', '2982', '2983',
  '3327', '3329', '3382', '3385', '3387', '3388', '3407', '3408', '3409', '3435', '3436', '3437',
  '3438', '3442', '3444', '3445', '3446', '3447', '3454', '3455', '3456', '3458', '3460', '3462',
  '3463', '3464', '3465', '3466', '3467', '3468', '3469', '3471', '3472', '3476', '3482', '3483',
  '3487', '3489', '3491', '3492', '3493', '3494', '3496', '3497', '3498', '3521', '3522', '3524',
  '3525', '3532', '3533', '3537', '3541', '3542', '3543', '3544', '3546', '3547', '3548', '3549',
  '3562', '3563', '3564', '3571', '3572', '3574', '3575', '3576', '3582', '3583', '3584', '3585',
  '3711', '3715', '3716', '3718', '3721', '3725', '3731', '3734', '3735', '3741', '3743', '3751',
  '3754', '3755', '3756', '3757', '3758', '3772', '3773', '3774', '3775', '3777', '3781', '3782',
  '3786', '3821', '3825', '3826', '3827', '3832', '3835', '3837', '3838', '3841', '3843', '3844',
  '3845', '3846', '3854', '3855', '3856', '3857', '3858', '3861', '3862', '3863', '3865', '3867',
  '3868', '3869', '3873', '3876', '3877', '3878', '3885', '3886', '3887', '3888', '3891', '3892',
  '3894',
])

export type PhoneKind = 'movil' | 'fijo' | 'desconocido'

export function rejectedPhone(raw: string) {
  if (/[#\p{L}]/u.test(raw)) return true
  return /\b(?:int|ext|interno)\b/i.test(raw)
}

export function stripFifteen(digits: string) {
  if (digits.length !== 12) return digits
  for (const length of [2, 3, 4]) {
    if (digits.slice(length, length + 2) !== '15') continue
    const rest = digits.slice(length + 2)
    if (length + rest.length === 10) return digits.slice(0, length) + rest
  }
  return digits
}

function validArea(code: string) {
  if (code === '11') return true
  if (code.length === 3) return AREA_3.has(code)
  if (code.length === 4) return AREA_4.has(code)
  return false
}

function national(raw: string) {
  let digits = raw.replace(/\D/g, '')
  if (digits.startsWith('00')) digits = digits.slice(2)
  if (digits.startsWith('54')) digits = digits.slice(2)
  if (digits.startsWith('9') && digits.length >= 11) digits = digits.slice(1)
  while (digits.startsWith('0')) digits = digits.slice(1)
  return digits
}

function hasFifteen(raw: string) {
  const digits = national(raw)
  if (digits.length !== 12 || digits.startsWith('15')) return false
  for (const length of [2, 3, 4]) {
    if (!validArea(digits.slice(0, length))) continue
    if (digits.slice(length, length + 2) !== '15') continue
    const rest = digits.slice(length + 2)
    if (length + rest.length === 10) return true
  }
  return false
}

function landline(raw: string) {
  const digits = raw.replace(/\D/g, '')
  if (!digits.startsWith('0')) return false
  const body = digits.replace(/^0+/, '')
  if (body.length !== 10 || hasFifteen(raw)) return false
  if (body.startsWith('11')) return true
  if (AREA_3.has(body.slice(0, 3))) return true
  return AREA_4.has(body.slice(0, 4))
}

/** Celular solo con prefijo 549 o un 15 después de un código de área. El resto no se adivina. */
export function phoneKindAR(raw: string): PhoneKind {
  const value = raw.trim()
  if (!value) return 'desconocido'
  if (rejectedPhone(value)) return 'fijo'
  const compact = value.replace(/[\s().-]/g, '')
  if (/^\+?549\d{10,}/.test(compact)) return 'movil'
  if (hasFifteen(value)) return 'movil'
  if (landline(value)) return 'fijo'
  return 'desconocido'
}
