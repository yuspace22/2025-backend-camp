const dayjs = require('dayjs')
const utc = require('dayjs/plugin/utc')

const { dataSource } = require('../db/data-source')
const logger = require('../utils/logger')('AdminController')

dayjs.extend(utc)
const monthMap = {
  january: 1,
  february: 2,
  march: 3,
  april: 4,
  may: 5,
  june: 6,
  july: 7,
  august: 8,
  september: 9,
  october: 10,
  november: 11,
  december: 12
}

function isUndefined (value) {
  return value === undefined
}

function isNotValidSting (value) {
  return typeof value !== 'string' || value.trim().length === 0 || value === ''
}

function isNotValidInteger (value) {
  return typeof value !== 'number' || value < 0 || value % 1 !== 0
}

// 🟢 Create：教練新增課程
class AdminController {
  static async postCourse (req, res, next) {
    try {
      // 拿到「目前登入的教練」的 ID
      const { id } = req.user 
      // 課程資料
      const {
        skill_id: skillId, name, description, start_at: startAt, end_at: endAt,
        max_participants: maxParticipants, meeting_url: meetingUrl
      } = req.body 
      
      if (isUndefined(skillId) || isNotValidSting(skillId) ||
      isUndefined(name) || isNotValidSting(name) ||
      isUndefined(description) || isNotValidSting(description) ||
      isUndefined(startAt) || isNotValidSting(startAt) ||
      isUndefined(endAt) || isNotValidSting(endAt) ||
      isUndefined(maxParticipants) || isNotValidInteger(maxParticipants) ||
      isUndefined(meetingUrl) || isNotValidSting(meetingUrl) || !meetingUrl.startsWith('https')) {
        logger.warn('欄位未填寫正確')
        res.status(400).json({
          status: 'failed',
          message: '欄位未填寫正確'
        })
        return
      }
      const userRepository = dataSource.getRepository('User')
      const existingUser = await userRepository.findOne({
        select: ['id', 'name', 'role'],
        where: { id }
      })
      if (!existingUser) {
        logger.warn('使用者不存在')
        res.status(400).json({
          status: 'failed',
          message: '使用者不存在'
        })
        return
      }
      const courseRepo = dataSource.getRepository('Course')
      //存進資料庫
      const newCourse = courseRepo.create({
        user_id: id,
        skill_id: skillId,
        name,
        description,
        start_at: startAt,
        end_at: endAt,
        max_participants: maxParticipants,
        meeting_url: meetingUrl
      })
      const savedCourse = await courseRepo.save(newCourse)
      const course = await courseRepo.findOne({
        where: { id: savedCourse.id }
      })
      res.status(201).json({
        status: 'success',
        data: {
          course
        }
      })
    } catch (error) {
      logger.error(error)
      next(error)
    }
  }

  static async getCoachRevenue (req, res, next) {
    try {
      const { id } = req.user
      const { month } = req.query
      if (isUndefined(month) || !Object.prototype.hasOwnProperty.call(monthMap, month)) {
        logger.warn('欄位未填寫正確')
        res.status(400).json({
          status: 'failed',
          message: '欄位未填寫正確'
        })
        return
      }
      const courseRepo = dataSource.getRepository('Course')
      const courses = await courseRepo.find({
        select: ['id'],
        where: { user_id: id }
      })
      const courseIds = courses.map(course => course.id)
      if (courseIds.length === 0) {
        res.status(200).json({
          status: 'success',
          data: {
            total: {
              revenue: 0,
              participants: 0,
              course_count: 0
            }
          }
        })
        return
      }
      const courseBookingRepo = dataSource.getRepository('CourseBooking')
      const year = new Date().getFullYear()
      const calculateStartAt = dayjs(`${year}-${month}-01`).startOf('month').toISOString()
      const calculateEndAt = dayjs(`${year}-${month}-01`).endOf('month').toISOString()
      const courseCount = await courseBookingRepo.createQueryBuilder('course_booking')
        .select('COUNT(*)', 'count')
        .where('course_id IN (:...ids)', { ids: courseIds })
        .andWhere('cancelled_at IS NULL')
        .andWhere('created_at >= :startDate', { startDate: calculateStartAt })
        .andWhere('created_at <= :endDate', { endDate: calculateEndAt })
        .getRawOne()
      const participants = await courseBookingRepo.createQueryBuilder('course_booking')
        .select('COUNT(DISTINCT(user_id))', 'count')
        .where('course_id IN (:...ids)', { ids: courseIds })
        .andWhere('cancelled_at IS NULL')
        .andWhere('created_at >= :startDate', { startDate: calculateStartAt })
        .andWhere('created_at <= :endDate', { endDate: calculateEndAt })
        .getRawOne()
      const totalCreditPackage = await dataSource.getRepository('CreditPackage').createQueryBuilder('credit_package')
        .select('SUM(credit_amount)', 'total_credit_amount')
        .addSelect('SUM(price)', 'total_price')
        .getRawOne()
      const perCreditPrice = totalCreditPackage.total_price / totalCreditPackage.total_credit_amount
      const totalRevenue = courseCount.count * perCreditPrice
      res.status(200).json({
        status: 'success',
        data: {
          total: {
            revenue: Math.floor(totalRevenue),
            participants: parseInt(participants.count, 10),
            course_count: parseInt(courseCount.count, 10)
          }
        }
      })
    } catch (error) {
      logger.error(error)
      next(error)
    }
  }

  static async getCoachCourses (req, res, next) {
    try {
      const { id } = req.user
      const courses = await dataSource.getRepository('Course').find({
        select: {
          id: true,
          name: true,
          start_at: true,
          end_at: true,
          max_participants: true,
          meeting_url: true
        },
        where: {
          user_id: id
        }
      })
      if (courses.length === 0) {
        res.status(200).json({
          status: 'success',
          data: []
        })
        return
      }
      const courseIds = courses.map((course) => course.id)
      const coursesParticipant = await dataSource.getRepository('CourseBooking')
        .createQueryBuilder('course_booking')
        .select('course_id')
        .addSelect('COUNT(course_id)', 'count')
        .where('course_id IN (:...courseIds)', { courseIds })
        .andWhere('cancelled_at is null')
        .groupBy('course_id')
        .getRawMany()
      logger.info(`coursesParticipant: ${JSON.stringify(coursesParticipant, null, 1)}`)
      const now = new Date()
      res.status(200).json({
        status: 'success',
        data: courses.map((course) => {
          const startAt = new Date(course.start_at)
          const endAt = new Date(course.end_at)
          let status = '尚未開始'
          if (startAt < now) {
            status = '進行中'
            if (endAt < now) {
              status = '已結束'
            }
          }
          const courseParticipant = coursesParticipant.find((courseParticipant) => courseParticipant.course_id === course.id)
          return {
            id: course.id,
            name: course.name,
            status,
            start_at: course.start_at,
            end_at: course.end_at,
            max_participants: course.max_participants,
            meeting_url: course.meeting_url,
            participants: courseParticipant ? courseParticipant.count : 0
          }
        })
      })
    } catch (error) {
      logger.error(error)
      next(error)
    }
  }

  static async getCoachCourseDetail (req, res, next) {
    try {
      const { id } = req.user
      const { courseId } = req.params
      if (isUndefined(courseId) || isNotValidSting(courseId)) {
        logger.warn('欄位未填寫正確')
        res.status(400).json({
          status: 'failed',
          message: '欄位未填寫正確'
        })
        return
      }
      const course = await dataSource.getRepository('Course').findOne({
        select: {
          id: true,
          name: true,
          description: true,
          start_at: true,
          end_at: true,
          max_participants: true,
          meeting_url: true,
          Skill: {
            id: true,
            name: true
          }
        },
        where: {
          id: courseId,
          user_id: id
        },
        relations: {
          Skill: true
        }
      })
      if (!course) {
        logger.warn('課程不存在')
        res.status(400).json({
          status: 'failed',
          message: '課程不存在'
        })
        return
      }
      res.status(200).json({
        status: 'success',
        data: {
          id: course.id,
          name: course.name,
          description: course.description,
          start_at: course.start_at,
          end_at: course.end_at,
          max_participants: course.max_participants,
          skill_name: course.Skill.name,
          skill_id: course.Skill.id,
          meeting_url: course.meeting_url
        }
      })
    } catch (error) {
      logger.error(error)
      next(error)
    }
  }

  static async putCoachCourseDetail (req, res, next) {
    try {
      const { id } = req.user
      const { courseId } = req.params
      const {
        skill_id: skillId, name, description, start_at: startAt, end_at: endAt,
        max_participants: maxParticipants, meeting_url: meetingUrl
      } = req.body
      if (isNotValidSting(courseId) ||
        isUndefined(skillId) || isNotValidSting(skillId) ||
        isUndefined(name) || isNotValidSting(name) ||
        isUndefined(description) || isNotValidSting(description) ||
        isUndefined(startAt) || isNotValidSting(startAt) ||
        isUndefined(endAt) || isNotValidSting(endAt) ||
        isUndefined(maxParticipants) || isNotValidInteger(maxParticipants) ||
        isUndefined(meetingUrl) || isNotValidSting(meetingUrl) || !meetingUrl.startsWith('https')) {
        logger.warn('欄位未填寫正確')
        res.status(400).json({
          status: 'failed',
          message: '欄位未填寫正確'
        })
        return
      }
      const courseRepo = dataSource.getRepository('Course')
      const existingCourse = await courseRepo.findOne({
        where: { id: courseId, user_id: id }
      })
      if (!existingCourse) {
        logger.warn('課程不存在')
        res.status(400).json({
          status: 'failed',
          message: '課程不存在'
        })
        return
      }
      const updateCourse = await courseRepo.update({
        id: courseId
      }, {
        skill_id: skillId,
        name,
        description,
        start_at: startAt,
        end_at: endAt,
        max_participants: maxParticipants,
        meeting_url: meetingUrl
      })
      if (updateCourse.affected === 0) {
        logger.warn('更新課程失敗')
        res.status(400).json({
          status: 'failed',
          message: '更新課程失敗'
        })
        return
      }
      const savedCourse = await courseRepo.findOne({
        where: { id: courseId }
      })
      res.status(200).json({
        status: 'success',
        data: {
          course: savedCourse
        }
      })
    } catch (error) {
      logger.error(error)
      next(error)
    }
  }

  static async postCoach (req, res, next) {
    try {
      const { userId } = req.params
      const { experience_years: experienceYears, description, profile_image_url: profileImageUrl = null } = req.body
      if (isUndefined(experienceYears) || isNotValidInteger(experienceYears) || isUndefined(description) || isNotValidSting(description)) {
        logger.warn('欄位未填寫正確')
        res.status(400).json({
          status: 'failed',
          message: '欄位未填寫正確'
        })
        return
      }
      if (profileImageUrl && !isNotValidSting(profileImageUrl) && !profileImageUrl.startsWith('https')) {
        logger.warn('大頭貼網址錯誤')
        res.status(400).json({
          status: 'failed',
          message: '欄位未填寫正確'
        })
        return
      }
      const userRepository = dataSource.getRepository('User')
      const existingUser = await userRepository.findOne({
        select: ['id', 'name', 'role'],
        where: { id: userId }
      })
      if (!existingUser) {
        logger.warn('使用者不存在')
        res.status(400).json({
          status: 'failed',
          message: '使用者不存在'
        })
        return
      } else if (existingUser.role === 'COACH') {
        logger.warn('使用者已經是教練')
        res.status(409).json({
          status: 'failed',
          message: '使用者已經是教練'
        })
        return
      }
      const coachRepo = dataSource.getRepository('Coach')
      const newCoach = coachRepo.create({
        user_id: userId,
        experience_years: experienceYears,
        description,
        profile_image_url: profileImageUrl
      })
      const updatedUser = await userRepository.update({
        id: userId,
        role: 'USER'
      }, {
        role: 'COACH'
      })
      if (updatedUser.affected === 0) {
        logger.warn('更新使用者失敗')
        res.status(400).json({
          status: 'failed',
          message: '更新使用者失敗'
        })
        return
      }
      const savedCoach = await coachRepo.save(newCoach)
      const savedUser = await userRepository.findOne({
        select: ['name', 'role'],
        where: { id: userId }
      })
      res.status(201).json({
        status: 'success',
        data: {
          user: savedUser,
          coach: savedCoach
        }
      })
    } catch (error) {
      logger.error(error)
      next(error)
    }
  }

  static async putCoachProfile (req, res, next) {
    try {
      const { id } = req.user
      const {
        experience_years: experienceYears,
        description,
        profile_image_url: profileImageUrl = null,
        skill_ids: skillIds
      } = req.body
      if (isUndefined(experienceYears) || isNotValidInteger(experienceYears) ||
        isUndefined(description) || isNotValidSting(description) ||
        isUndefined(profileImageUrl) || isNotValidSting(profileImageUrl) ||
        !profileImageUrl.startsWith('https') ||
        isUndefined(skillIds) || !Array.isArray(skillIds)) {
        logger.warn('欄位未填寫正確')
        res.status(400).json({
          status: 'failed',
          message: '欄位未填寫正確'
        })
        return
      }
      if (skillIds.length === 0 || skillIds.every(skill => isUndefined(skill) || isNotValidSting(skill))) {
        logger.warn('欄位未填寫正確')
        res.status(400).json({
          status: 'failed',
          message: '欄位未填寫正確'
        })
        return
      }
      const coachRepo = dataSource.getRepository('Coach')
      const coach = await coachRepo.findOne({
        select: ['id'],
        where: { user_id: id }
      })
      await coachRepo.update({
        id: coach.id
      }, {
        experience_years: experienceYears,
        description,
        profile_image_url: profileImageUrl
      })
      const coachLinkSkillRepo = dataSource.getRepository('CoachLinkSkill')
      const newCoachLinkSkill = skillIds.map(skill => ({
        coach_id: coach.id,
        skill_id: skill
      }))
      await coachLinkSkillRepo.delete({ coach_id: coach.id })
      const insert = await coachLinkSkillRepo.insert(newCoachLinkSkill)
      logger.info(`newCoachLinkSkill: ${JSON.stringify(newCoachLinkSkill, null, 1)}`)
      logger.info(`insert: ${JSON.stringify(insert, null, 1)}`)
      const result = await coachRepo.find({
        select: {
          id: true,
          experience_years: true,
          description: true,
          profile_image_url: true,
          CoachLinkSkill: {
            skill_id: true
          }
        },
        where: { id: coach.id },
        relations: {
          CoachLinkSkill: true
        }
      })
      logger.info(`result: ${JSON.stringify(result, null, 1)}`)
      res.status(200).json({
        status: 'success',
        data: {
          id: result[0].id,
          experience_years: result[0].experience_years,
          description: result[0].description,
          profile_image_url: result[0].profile_image_url,
          skill_ids: result[0].CoachLinkSkill.map(skill => skill.skill_id)
        }
      })
    } catch (error) {
      logger.error(error)
      next(error)
    }
  }

  static async getCoachProfile (req, res, next) {
    try {
      const { id } = req.user
      const coachRepo = dataSource.getRepository('Coach')
      const coach = await coachRepo.findOne({
        select: ['id', 'experience_years', 'description', 'profile_image_url'],
        where: { user_id: id }
      })
      const coachSkill = await dataSource.getRepository('CoachLinkSkill').find({
        select: {
          skill_id: true
        },
        where: { coach_id: coach.id }
      })
      logger.info(`coachSkill: ${JSON.stringify(coachSkill, null, 1)}`)
      res.status(200).json({
        status: 'success',
        data: {
          id: coach.id,
          experience_years: coach.experience_years,
          description: coach.description,
          profile_image_url: coach.profile_image_url,
          skill_ids: coachSkill.length > 0 ? coachSkill.map(({ skill_id: skillId }) => skillId) : []
        }
      })
    } catch (error) {
      logger.error(error)
      next(error)
    }
  }
}
module.exports = AdminController
