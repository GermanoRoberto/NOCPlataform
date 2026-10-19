const autoDeployService = require('../../services/auto-deploy-service');

class AutoDeployController {
    async getBranches(req, res, next) {
        try {
            const data = await autoDeployService.getBranchCandidates();
            res.json({ success: true, branches: data });
        } catch (err) {
            next(err);
        }
    }

    async triggerDeploy(req, res) {
        try {
            const { branchCode } = req.body;
            if (!branchCode) {
                return res.status(400).json({ success: false, error: 'branchCode é obrigatório.' });
            }
            const result = await autoDeployService.triggerBranchDeploy(branchCode);
            res.json(result);
        } catch (err) {
            res.status(500).json({ success: false, error: err.message || 'Falha ao despachar auto-deploy' });
        }
    }

    streamLogs(req, res) {
        const { branchCode } = req.params;
        autoDeployService.subscribeLogs(branchCode, req, res);
    }

    checkPendingTask(req, res) {
        try {
            const { host } = req.query;
            const result = autoDeployService.claimPendingTask(host);
            res.json(result);
        } catch (err) {
            res.status(500).json({ hasTask: false, error: err.message });
        }
    }

    async registerBranch(req, res, next) {
        try {
            const { ip, ips, hostname, city } = req.body;
            const result = await autoDeployService.registerBranchDevice({ ip, ips, hostname, city });
            res.json(result);
        } catch (err) {
            next(err);
        }
    }

    receiveLog(req, res, next) {
        try {
            const { branch, text, done, code } = req.body;
            if (branch && text) {
                autoDeployService.receiveLog(branch, text, !!done, code || 0);
            }
            res.json({ success: true });
        } catch (err) {
            next(err);
        }
    }
}

module.exports = new AutoDeployController();
