const puppeteer = require('puppeteer-extra')
const StealthPlugin = require('puppeteer-extra-plugin-stealth')
const AdblockerPlugin = require('puppeteer-extra-plugin-adblocker')
const HTMLParser = require('node-html-parser');

puppeteer.use(StealthPlugin())
puppeteer.use(AdblockerPlugin({ blockTrackers: true }))

DEBUG = false;

async function run(videoID) {
  const browser = await puppeteer.launch({ headless: !DEBUG });
  const page = await browser.newPage();

  await page.goto('https://player.twitch.tv/?autoplay=false&parent=127.0.0.1&video=v' + videoID)
  await page.setDefaultTimeout(5000)


    await page.evaluate(() => {
        localStorage.setItem('mature', 'true')
        localStorage.setItem('video-muted', '{"default":false}')
        localStorage.setItem('volume', '0.5')
        localStorage.setItem('video-quality', '{"default":"160p30"}')
    })

    await page.setViewport({ width: 1280, height: 720 })
    await page.reload({
        waitUntil: ["networkidle2", "domcontentloaded"]
    })

    try {
      await page.waitForSelector("div.chapter-select-button__chapters")
    } catch (e) {
      console.log(e);
      return {'error': 'No Chapters'};
    }
    

    const bodyHandle = await page.$('div#chapter-select-popover-body');
    const html = await page.evaluate((body) => body.innerHTML, bodyHandle);
    await bodyHandle.dispose();
    
    const root = await HTMLParser.parse(html)
    if (DEBUG) {console.log(root.firstChild.structuredText)}

    const output = {}
    let count = 0
    if (DEBUG) {console.log(root.childNodes)}
    for await (const e of root.childNodes) {
      let name = e.structuredText.split('\n')[0].toString()
      let time = e.structuredText.split('\n')[1].toString()

      output[count] = {
        'game': name,
        'time': time
      }

      let hours = '0'
      let minutes = '0'

      let hOrHs = 'hour'
      let mOrMs = 'minute'

      if (output[Math.max(count-1, 0)]['time'].includes('hours')) {
        hOrHs = 'hours'
      }
      if (output[Math.max(count-1, 0)]['time'].includes('minutes')) {
        mOrMs = 'minutes'
      }

      if (!(time.includes('left'))) {
        hours = output[Math.max(count-1, 0)]['time'].split(hOrHs)[0].trim()
        minutes = output[Math.max(count-1, 0)]['time'].split(hOrHs)[1].split(mOrMs)[0].trim()
      }
      
      output[count]['startTime'] = `${hours}:${minutes}`

      count++;
    }
    output['length'] = count
    if (DEBUG) {console.log(output)}
    
    await browser.close();

    if (DEBUG) {console.log(output)}
    return output;
}

function isNumeric(n) {
  return !isNaN(parseFloat(n)) && isFinite(n);
}

const http = require("http");

const server = http.createServer((req, res) => {
  const urlPath = req.url;
  if (DEBUG) {console.log(urlPath)}

  res.writeHead(200, { "Content-Type": "application/json" });

  if (urlPath.includes('/twitch/') && isNumeric(urlPath.split('/')[2])) {
    run(urlPath.split('/')[2]).then(data => {
      if (DEBUG) {console.log(data)}
      res.end(
        JSON.stringify({
          "videoID": urlPath.split('/')[2],
          "data": data,
        })
      )
    })
  } else {
    res.end(
      JSON.stringify({
        'error': "Invalid Request"
      })
    )
  }

});

server.listen(3000, "localhost", () => {
  console.log("Listening for request");
});