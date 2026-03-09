import { Router } from 'express';
import { getEmployees, getEmployee } from '../csvWatcher.js';

export const employeesRouter = Router();

employeesRouter.get('/', (_req, res) => {
  res.json(getEmployees());
});

employeesRouter.get('/:id', (req, res) => {
  const employee = getEmployee(req.params.id);
  if (!employee) {
    res.status(404).json({ error: 'Employee not found' });
    return;
  }
  res.json(employee);
});
