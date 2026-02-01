const express = require('express')

const router = express.Router()
const skillController = require('../controllers/skill')

//Read 
router.get('/', skillController.getAll)

//Create
router.post('/', skillController.postSkill)

//Delete
router.delete('/:skillId', skillController.delete)

module.exports = router
