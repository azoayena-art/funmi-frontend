import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { databases, account } from '../lib/appwrite'; // Ajuste selon ton chemin d'import
import { DATABASE_ID } from '../lib/constants'; // Ajuste selon tes constantes

const AdminGuard = ({ children }) => {
  const [isAuthorized, setIsAuthorized] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    const checkAdmin = async () => {
      try {
        const user = await account.get();
        
        // Vérifie si l'utilisateur est dans la collection super_admins
        const response = await databases.listDocuments(
          DATABASE_ID,
          'super_admins',
          [`equal('userId', '${user.$id}')`]
        );

        if (response.documents.length > 0) {
          setIsAuthorized(true);
        } else {
          setIsAuthorized(false);
          navigate('/dashboard'); // Redirige si pas admin
        }
      } catch (error) {
        navigate('/login'); // Redirige si pas connecté
      }
    };

    checkAdmin();
  }, [navigate]);

  if (isAuthorized === null) {
    return <div className="flex justify-center items-center h-screen">Vérification des droits...</div>;
  }

  if (!isAuthorized) return null;

  return children;
};

export default AdminGuard;