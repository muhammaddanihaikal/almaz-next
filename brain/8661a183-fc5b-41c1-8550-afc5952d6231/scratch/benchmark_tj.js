const { getTitipJualList } = require("../../../actions/titip_jual")

async function main() {
  const start = Date.now()
  try {
    const list = await getTitipJualList()
    const end = Date.now()
    console.log(`getTitipJualList took: ${end - start}ms for ${list.length} records`)
  } catch (e) {
    console.error(e)
  }
}

main()
