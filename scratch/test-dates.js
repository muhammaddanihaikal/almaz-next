const getDatesInRange = (startStr, endStr) => {
  const arr = []
  let current = new Date(startStr)
  const end = new Date(endStr)
  current.setUTCHours(0, 0, 0, 0)
  end.setUTCHours(0, 0, 0, 0)
  while (current <= end) {
    const yyyy = current.getUTCFullYear()
    const mm = String(current.getUTCMonth() + 1).padStart(2, '0')
    const dd = String(current.getUTCDate()).padStart(2, '0')
    arr.push(`${yyyy}-${mm}-${dd}`)
    current.setUTCDate(current.getUTCDate() + 1)
  }
  return arr
}

console.log(getDatesInRange('2026-04-20', '2026-05-21'));
