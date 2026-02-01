const { dataSource } = require('../db/data-source')
const logger = require('../utils/logger')('SkillController')

function isUndefined (value) {
  return value === undefined
}

function isNotValidSting (value) {
  return typeof value !== 'string' || value.trim().length === 0 || value === ''
}

// 🔵 Read：讀取所有技能
class SkillController {
  static async getAll (req, res, next) {
    try {
      const skill = await dataSource.getRepository('Skill').find({
        select: ['id', 'name']
      })
      res.status(200).json({
        status: 'success',
        data: skill
      })
    } catch (error) {
      logger.error(error)
      next(error)
    }
  }

  // 🟢 Create：新增技能
  static async postSkill (req, res, next) {
    try {
      // 1. 拿到使用者輸入的名稱
      const { name } = req.body 
      // 2. 檢查有沒有填寫
      if (isUndefined(name) || isNotValidSting(name)) {
        res.status(400).json({
          status: 'failed',
          message: '欄位未填寫正確'
        })
        return
      }
      // 3. 檢查資料庫有沒有重複
      const skillRepo = dataSource.getRepository('Skill')
      const existSkill = await skillRepo.find({
        where: {
          name
        }
      })
      if (existSkill.length > 0) {
        res.status(409).json({
          status: 'failed',
          message: '資料重複'
        })
        return
      }
      //4. 存進資料庫（這就是 INSERT！）
      const newSkill = await skillRepo.create({
        name
      })
      const result = await skillRepo.save(newSkill)
      res.status(200).json({
        status: 'success',
        data: result
      })
    } catch (error) {
      logger.error(error)
      next(error)
    }
  }

  // 🔴 Delete：刪除技能
  static async delete (req, res, next) {
    try {
      // 1. 拿到要刪的 ID
      const skillId = req.url.split('/').pop()
      // 2. 檢查 ID 有沒有問題
      if (isUndefined(skillId) || isNotValidSting(skillId)) {
        res.status(400).json({
          status: 'failed',
          message: 'ID錯誤'
        })
        return
      }
      // 3. 從資料庫刪掉（這就是 DELETE！）
      const result = await dataSource.getRepository('Skill').delete(skillId)
      if (result.affected === 0) {
        res.status(400).json({
          status: 'failed',
          message: 'ID錯誤'
        })
        return
      }
      res.status(200).json({
        status: 'success',
        data: result
      })
      res.end()
    } catch (error) {
      logger.error(error)
      next(error)
    }
  }
}
module.exports = SkillController
