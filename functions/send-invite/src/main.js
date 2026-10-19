import { Client, Databases } from 'node-appwrite';
import { Resend } from 'resend';

export default async ({ req, res, log, error }) => {
    try {
        // 1. Lire les données envoyées de manière sécurisée
        const payload = req.payload || {};
        const email = payload.email;
        const roleName = payload.roleName;
        const memberDocId = payload.memberDocId;
        const teamName = payload.teamName || 'Funmi';

        log("Données reçues:", JSON.stringify(payload));

        if (!email || !roleName) {
            return res.json({ success: false, error: "Email et rôle requis" }, 400);
        }

        // 2. Initialiser Resend
        const resend = new Resend(process.env.RESEND_API_KEY);
        const FROM_EMAIL = process.env.FROM_EMAIL || 'onboarding@resend.dev';
        const APP_URL = process.env.APP_URL || 'http://localhost:5173';

        // 3. Envoyer l'email
        const emailRes = await resend.emails.send({
            from: `Funmi <${FROM_EMAIL}>`,
            to: email,
            subject: `Invitation à rejoindre l'équipe ${teamName}`,
            html: `
                <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
                    <h2 style="color: #9333ea;">Vous avez été invité !</h2>
                    <p>Bonjour,</p>
                    <p>Vous avez été invité à rejoindre l'espace <strong>${teamName}</strong> en tant que <strong>${roleName}</strong>.</p>
                    <p>Pour accepter cette invitation et commencer à collaborer, cliquez sur le bouton ci-dessous :</p>
                    <a href="${APP_URL}/register" style="display: inline-block; background-color: #9333ea; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 20px 0; font-weight: bold;">Rejoindre l'équipe</a>
                    <p style="font-size: 12px; color: #666;">Si vous n'attendiez pas cette invitation, vous pouvez ignorer cet email.</p>
                    <p>Cordialement,<br>L'équipe Funmi</p>
                </div>
            `
        });

        if (emailRes.error) {
            error(`Erreur Resend: ${JSON.stringify(emailRes.error)}`);
            return res.json({ success: false, error: emailRes.error }, 500);
        }

        log(`✅ Email envoyé à ${email}`);

        // 4. Mettre à jour le statut dans Appwrite
        if (memberDocId) {
            try {
                const client = new Client()
                    .setEndpoint(process.env.APPWRITE_ENDPOINT || 'https://cloud.appwrite.io/v1')
                    .setProject(process.env.APPWRITE_PROJECT_ID)
                    .setKey(process.env.APPWRITE_API_KEY);

                const databases = new Databases(client);
                await databases.updateDocument(
                    process.env.DATABASE_ID, 
                    'team_members', 
                    memberDocId, 
                    { status: 'invited' }
                );
                log(`✅ Statut mis à jour`);
            } catch (dbErr) {
                error(`Erreur DB: ${dbErr.message}`);
            }
        }

        return res.json({ success: true, message: "Invitation envoyée" });

    } catch (err) {
        error(`Erreur globale: ${err.message}`);
        return res.json({ success: false, error: err.message }, 500);
    }
};