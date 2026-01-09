import AuditLog from "../models/audit.model.js";

export const logActivity = async ({ action, user, target, targetModel, details }) => {
    try {
        await AuditLog.create({
            action,
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                role: user.role
            },
            target,
            targetModel,
            details
        });
    } catch (error) {
        console.error("Audit Log Failure:", error);
    }
};
