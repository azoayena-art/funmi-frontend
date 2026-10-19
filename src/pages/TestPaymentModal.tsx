import { useState, useEffect } from 'react';
import Sidebar from '../components/Sidebar';
import PaymentModal from '../components/PaymentModal';
import { databases, DATABASE_ID } from '../appwrite';
import { Query } from 'appwrite';
import { useTeam } from '../context/TeamContext';

export default function TestPaymentModal() {
  const { customTeamId } = useTeam();
  const [isOpen, setIsOpen] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<any>(null);
const [invoices, setInvoices] = useState<any[]>([]);

const loadInvoices = async () => {
  if (!customTeamId) return;
  try {
    const res = await databases.listDocuments(DATABASE_ID, 'invoices', [
      Query.equal('teamId', customTeamId),
      Query.notEqual('status', 'paid'),
      Query.notEqual('status', 'cancelled'),
      Query.orderDesc('$createdAt'),
      Query.limit(10),
    ]);
    setInvoices(res.documents);
    console.log('📋 Factures chargées:', res.documents.length);
  } catch (e) {
    console.error('❌ Erreur chargement:', e);
  }
};

// ✅ Utiliser useEffect pour charger au montage
useEffect(() => {
  loadInvoices();
}, [customTeamId]);  // Se recharge si l'équipe change

  useState(() => {
    loadInvoices();
  }, []);

  const handleOpen = (invoice: any) => {
    setSelectedInvoice(invoice);
    setIsOpen(true);
  };

  const handleSuccess = () => {
    loadInvoices();
  };

  return (
    <Sidebar>
      <div className="p-8">
        <h1 className="text-2xl font-bold mb-6">Test Modal Paiement</h1>
        
        <div className="space-y-2">
          {invoices.map((inv) => (
            <div key={inv.$id} className="flex items-center justify-between p-4 bg-white rounded-lg shadow">
              <div>
                <p className="font-semibold">{inv.invoiceNumber}</p>
                <p className="text-sm text-slate-500">{inv.clientName}</p>
              </div>
              <div className="flex items-center gap-4">
                <p className="font-bold">{inv.total} €</p>
                <p className="text-xs text-slate-400">{inv.status}</p>
                <button
                  onClick={() => handleOpen(inv)}
                  className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700"
                >
                  Encaisser
                </button>
              </div>
            </div>
          ))}
        </div>

        {invoices.length === 0 && (
          <p className="text-slate-500">Aucune facture impayée trouvée</p>
        )}

        <PaymentModal
          isOpen={isOpen}
          onClose={() => setIsOpen(false)}
          invoice={selectedInvoice}
          type="client"
          onSuccess={handleSuccess}
        />
      </div>
    </Sidebar>
  );
}