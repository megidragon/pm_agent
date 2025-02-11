// cronJobs.js
import cron from 'node-cron';
import { checkGoogleServices } from './googleServices.js';

function scheduleGoogleServicesCheck() {
    cron.schedule('*/15 * * * *', () => {
        console.log('Revisando Google Calendar y Gmail...');
        checkGoogleServices();
    });
}

async function updateTaskStatus() {
    // Placeholder: lógica para actualizar el estado de las tareas
}

function scheduleTaskStatusUpdate() {
    cron.schedule('* * * * *', () => {
        updateTaskStatus();
    });
}

export { scheduleGoogleServicesCheck, scheduleTaskStatusUpdate };
