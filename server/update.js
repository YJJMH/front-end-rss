const fs = require('fs-extra')
const Async = require('async')
const moment = require('moment')
const simpleGit = require('simple-git')

const utils = require('./utils')
const writemd = require('./writemd')
const createFeed = require('./feed')
const fetch = require('./fetch')

const {
  RESP_PATH,
  RSS_PATH,
  LINKS_PATH,
} = utils.PATH

const git = simpleGit(RESP_PATH)

let rssJson = null
let linksJson = null
let newData = null

/**
 * 更新 git 仓库
 */
function handleUpdate() {
  utils.log('开始更新抓取')

  git.pull().exec(handleFeed)
}

/**
 * 提交修改到 git 仓库
 */
function handleCommit() {
  utils.log('完成抓取，即将上传')

  git.add('./*')
    .commit('更新: ' + newData.titles.join('、'))
    .push(['-u', 'origin', 'master'], () => utils.logSuccess('完成抓取和上传！'))
}

/**
 * 处理订阅源
 */
function handleFeed() {
  rssJson = fs.readJsonSync(RSS_PATH)
  linksJson = fs.readJsonSync(LINKS_PATH)
  newData = {
    length: 0,
    titles: [],
    rss: {},
    links: {}
  }

  const tasks = rssJson.map((rssItem, rssIndex) => ((callback) => {
    ((async () => {
      const feed = await fetch(rssItem)
      if (feed) {
        const items = linksJson[rssIndex]?.items || []
        const newItems = feed.items.reduce((prev, curr) => {
          const exist = items.find((el) => utils.isSameLink(el.link, curr.link))
          if (exist) {
            return prev
          } else {
            let date = moment().format('YYYY-MM-DD')

            try {
              date = moment(curr.isoDate).format('YYYY-MM-DD')
            } catch (e) {}

            newData.rss[rssItem.title] = true
            newData.links[curr.link] = true

            return [...prev, {
              title: curr.title,
              link: curr.link,
              date
            }]
          }
        }, [])

        if (newItems.length) {
          utils.logSuccess('更新 RSS: ' + rssItem.title)
          newData.titles.push(rssItem.title)
          newData.length += newItems.length
          linksJson[rssIndex] = {
            title: rssItem.title,
            items: newItems.concat(items).sort(function (a, b) {
              return a.date < b.date ? 1 : -1
            })
          }
        }
      }
      callback(null)
    })())
  }))

  Async.series(tasks, async () => {
    if (newData.length) {
      fs.outputJsonSync(LINKS_PATH, linksJson)
      await writemd(newData, linksJson)
      await createFeed(linksJson)
      handleCommit()
    } else {
      utils.logSuccess('无需更新')
    }
    rssJson = null
    linksJson = null
    newData = null
  })
}

module.exports = handleUpdate
