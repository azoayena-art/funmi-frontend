import { Client, Databases, Query } from 'node-appwrite';
import { Resend } from 'resend';

export default async ({ req, res, log, error }) => {
    // 1. Initialisation des services
    const resend = new Resend(process.env.RESEND_API_KEY);
    const client = new Client()
        .setEndpoint(process.env.APPWRITE_ENDPOINT)
        .setProject(process.env.APPWRITE_PROJECT_ID)
        .setKey(process.env.APPWRITE_API_KEY);

    const databases = new Databases(client);
    const DATABASE_ID = process.env.DATABASE_ID;
    const COLLECTION_ID = process.env.COLLECTION_ID;
    const FROM_EMAIL = process.env.FROM_EMAIL || 'onboarding@resend.dev';
    const APP_URL = process.env.APP_URL || 'http://localhost:5173';

    try {
        // 2. Récupérer toutes les factures qui ne sont ni payées ni annulées
        const response = await databases.listDocuments(DATABASE_ID, COLLECTION_ID, [
            Query.notEqual('status', 'paid'),
            Query.notEqual('status', 'cancelled')
        ]);

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        let emailsSent = 0;

        for (const invoice of response.documents) {
            if (!invoice.dueDate || !invoice.clientEmail) continue;

            const dueDate = new Date(invoice.dueDate);
            dueDate.setHours(0, 0, 0, 0);
            
            const diffTime = dueDate.getTime() - today.getTime();
            const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

            let subject = '';
            let htmlContent = '';
            let newStatus = invoice.status;
            let shouldUpdate = false;

            // J+7 : Dernière relance
            if (diffDays === -7) {
                subject = `⚠️ DERNIÈRE RELANCE : Facture ${invoice.invoiceNumber} en retard`;
                htmlContent = `<p>Bonjour ${invoice.clientName},</p>
                <p>Sauf erreur de notre part, nous n'avons pas reçu le paiement de la facture <strong>${invoice.invoiceNumber}</strong> d'un montant de <strong>${invoice.total} €</strong>, qui était échue le ${invoice.dueDate}.</p>
                <p>Merci de régulariser votre situation dans les plus brefs délais.</p>
                <p>Vous pouvez consulter votre facture ici : <a href="${APP_URL}/f/${invoice.clientToken}">Voir la facture</a></p>
                <p>Cordialement,<br>${invoice.companyName}</p>`;
                newStatus = 'overdue';
                shouldUpdate = true;
            } 
            // J+3 : Première relance
            else if (diffDays === -3) {
                subject = `⚠️ Relance : Facture ${invoice.invoiceNumber} en attente de paiement`;
                htmlContent = `<p>Bonjour ${invoice.clientName},</p>
                <p>Nous vous rappelons que la facture <strong>${invoice.invoiceNumber}</strong> d'un montant de <strong>${invoice.total} €</strong> est en retard de 3 jours (échéance : ${invoice.dueDate}).</p>
                <p>Si vous avez déjà effectué le virement, merci de ne pas tenir compte de ce message.</p>
                <p>Vous pouvez consulter votre facture ici : <a href="${APP_URL}/f/${invoice.clientToken}">Voir la facture</a></p>
                <p>Cordialement,<br>${invoice.companyName}</p>`;
                newStatus = 'overdue';
                shouldUpdate = true;
            }
            // J-3 : Rappel amical
            else if (diffDays === 3) {
                subject = `🔔 Rappel : Votre facture ${invoice.invoiceNumber} arrive à échéance`;
                htmlContent = `<p>Bonjour ${invoice.clientName},</p>
                <p>Ceci est un rappel amical concernant la facture <strong>${invoice.invoiceNumber}</strong> d'un montant de <strong>${invoice.total} €</strong>, qui arrive à échéance le ${invoice.dueDate}.</p>
                <p>Vous pouvez la consulter ici : <a href="${APP_URL}/f/${invoice.clientToken}">Voir la facture</a></p>
                <p>Cordialement,<br>${invoice.companyName}</p>`;
                newStatus = 'near_due';
                shouldUpdate = true;
            }

            if (shouldUpdate) {
                try {
                    const emailRes = await resend.emails.send({
                        from: `Funmi <${FROM_EMAIL}>`,
                        to: invoice.clientEmail,
                        subject: subject,
                        html: htmlContent,
                    });

                    if (emailRes.error) {
                        error(`❌ Erreur envoi email à ${invoice.clientEmail}: ${JSON.stringify(emailRes.error)}`);
                    } else {
                        log(`✅ Email envoyé avec succès à ${invoice.clientEmail} pour la facture ${invoice.invoiceNumber}`);
                        
                        await databases.updateDocument(DATABASE_ID, COLLECTION_ID, invoice.$id, {
                            status: newStatus
                        });
                        emailsSent++;
                    }
                } catch (emailErr) {
                    error(`Erreur critique envoi email: ${emailErr.message}`);
                }
            }
        }

        return res.json({ success: true, emailsSent, message: "Traitement terminé" });
    } catch (err) {
        error(`Erreur globale: ${err.message}`);
        return res.json({ success: false, error: err.message }, 500);
    }
};