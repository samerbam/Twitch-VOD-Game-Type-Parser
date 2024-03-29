const puppeteer = require('puppeteer-extra')
const StealthPlugin = require('puppeteer-extra-plugin-stealth')
const AdblockerPlugin = require('puppeteer-extra-plugin-adblocker')
const HTMLParser = require('node-html-parser');
const http = require("http");
const twitch_m3u8 = require("twitch-m3u8"); //TODO: Test this feature on new /m3u8 endpoint

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
      await page.close();
      await browser.close();
      return null;
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
        if (output[Math.max(count-1, 0)]['time'].includes(hOrHs)) {
          hours = parseInt(output[Math.max(count-1, 0)]['startTime'].split(":")[0])+parseInt(output[Math.max(count-1, 0)]['time'].split(hOrHs)[0].trim())
          
          if (output[Math.max(count-1, 0)]['time'].includes(mOrMs)) {
            minutes = parseInt(output[Math.max(count-1, 0)]['startTime'].split(":")[1])+parseInt(output[Math.max(count-1, 0)]['time'].split(hOrHs)[1].split(mOrMs)[0].trim()) 
          }
        } else if (output[Math.max(count-1, 0)]['time'].includes(mOrMs)) {
            minutes = parseInt(output[Math.max(count-1, 0)]['startTime'].split(":")[1]) + parseInt(output[Math.max(count-1, 0)]['time'].split(mOrMs)[0].trim())
        }
        // hours = output[Math.max(count-1, 0)]['time'].split(hOrHs)[0].trim()
        // minutes = output[Math.max(count-1, 0)]['time'].split(hOrHs)[1].split(mOrMs)[0].trim()
        
        if (DEBUG) {
          console.log('====')
          console.log(hours)
          console.log(minutes)
          console.log(output[Math.max(count-1, 0)]['startTime'].split(":"))
          console.log('new output:')

          if (output[Math.max(count-1, 0)]['time'].includes(hOrHs)) {
            console.log(parseInt(output[Math.max(count-1, 0)]['startTime'].split(":")[0])+parseInt(output[Math.max(count-1, 0)]['time'].split(hOrHs)[0].trim()))
            
            if (output[Math.max(count-1, 0)]['time'].includes(mOrMs)) {
              console.log(parseInt(output[Math.max(count-1, 0)]['startTime'].split(":")[1])+parseInt(output[Math.max(count-1, 0)]['time'].split(hOrHs)[1].split(mOrMs)[0].trim()))
            }
          } else if (output[Math.max(count-1, 0)]['time'].includes(mOrMs)) {
              console.log(parseInt(output[Math.max(count-1, 0)]['startTime'].split(":")[1]) + parseInt(output[Math.max(count-1, 0)]['time'].split(mOrMs)[0].trim()))
          }

          // console.log(parseInt(output[Math.max(count-1, 0)]['startTime'].split(":")[0])+parseInt(output[Math.max(count-1, 0)]['time'].split(hOrHs)[0].trim()))
          // console.log(parseInt(output[Math.max(count-1, 0)]['startTime'].split(":")[1])+parseInt(output[Math.max(count-1, 0)]['time'].split(hOrHs)[1].split(mOrMs)[0].trim()))
          console.log('===')
        }
      }
      
      output[count]['startTime'] = `${hours}:${minutes}`

      count++;
    }
    output['length'] = count
    if (DEBUG) {console.log(output)}
    
    await page.close();
    await browser.close();

    if (DEBUG) {console.log(output)}
    return output;
}

function isNumeric(n) {
  return !isNaN(parseFloat(n)) && isFinite(n);
}

const server = http.createServer((req, res) => {
  const urlPath = req.url;
  if (DEBUG) {console.log(urlPath)}


  if (urlPath.includes('/twitch/') && isNumeric(urlPath.split('/')[2])) {
    run(urlPath.split('/')[2]).then(data => {
      if (DEBUG) {console.log(data)}
      if (data != null) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            "videoID": urlPath.split('/')[2],
            "data": data,
          })
        )
      } else {
        res.writeHead(500)
        res.end()
      }
    })
  } else if (urlPath.includes('/m3u8/') && isNumeric(urlPath.split('/')[2])) {
    twitch_m3u8.getVod(urlPath.split('/')[2]).then(data => {
      res.writeHead(200, {"Content-Type": "application/json"});
      res.end(
        JSON.stringify({
          "m3u8": data
        })
      )
    }).catch(err => {
      console.log(err)
      res.writeHead(500)
      res.end()
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