import { useState, useEffect, useRef, type ReactNode, createContext, useContext, type FormEvent } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  ChevronLeft, 
  AlertCircle, 
  MessageCircle, 
  ShieldAlert, 
  Users, 
  Menu, 
  Layout, 
  Code, 
  Cpu, 
  TrendingUp,
  Send,
  Loader2,
  LogIn,
  LogOut,
  User as UserIcon,
  Home as HomeIcon
} from "lucide-react";
import { getChatResponse } from "./services/geminiService";
import { auth, db } from "./firebase";
import { 
  signInWithPopup, 
  GoogleAuthProvider, 
  onAuthStateChanged, 
  signOut,
  User
} from "firebase/auth";
import { 
  doc, 
  getDoc, 
  setDoc, 
  collection, 
  addDoc, 
  serverTimestamp,
  getDocFromServer,
  updateDoc,
  arrayUnion,
  onSnapshot
} from "firebase/firestore";
import { 
  MapPin,
  Phone,
  Info,
  ShieldCheck,
  Search,
  FileText,
  Calendar,
  CreditCard,
  Bell
} from "lucide-react";

// --- Firebase Error Handling ---
enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// --- Auth Context ---
interface AuthContextType {
  user: User | null;
  loading: boolean;
  profile: any | null;
}

const AuthContext = createContext<AuthContextType>({ user: null, loading: true, profile: null });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        const userDocRef = doc(db, "users", currentUser.uid);
        try {
          const userDoc = await getDoc(userDocRef);
          if (userDoc.exists()) {
            setProfile(userDoc.data());
          } else {
            const newProfile = {
              uid: currentUser.uid,
              name: currentUser.displayName || "Usuária",
              email: currentUser.email || "",
              role: "user",
              createdAt: serverTimestamp()
            };
            await setDoc(userDocRef, newProfile);
            setProfile(newProfile);
          }
        } catch (error) {
          console.error("Error fetching profile:", error);
        }
      } else {
        setProfile(null);
      }
      setLoading(false);
    });

    // Test connection
    const testConnection = async () => {
      try {
        await getDocFromServer(doc(db, 'test', 'connection'));
      } catch (error) {
        if(error instanceof Error && error.message.includes('the client is offline')) {
          console.error("Please check your Firebase configuration.");
        }
      }
    };
    testConnection();

    return () => unsubscribe();
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, profile }}>
      {children}
    </AuthContext.Provider>
  );
}

// --- Main App Component ---
type Screen = {
  id: number;
  title: string;
  subtitle?: string;
  content: ReactNode;
  showNext?: boolean;
  nextText?: string;
};

export default function App() {
  return (
    <AuthProvider>
      <SmartSampaApp />
    </AuthProvider>
  );
}

function SmartSampaApp() {
  const { user, loading: authLoading, profile } = useContext(AuthContext);
  const [currentScreen, setCurrentScreen] = useState(0);
  const [chatOpen, setChatOpen] = useState(false);
  const [policeChatOpen, setPoliceChatOpen] = useState(false);
  const [policeChatType, setPoliceChatType] = useState<"violencia" | "crianca_desaparecida" | null>(null);
  const [policeReportId, setPoliceReportId] = useState<string | null>(null);
  const [messages, setMessages] = useState<{ role: "user" | "model"; text: string }[]>([]);
  const [policeMessages, setPoliceMessages] = useState<{ sender: "user" | "police"; text: string; location?: { lat: number; lng: number }; timestamp: any }[]>([]);
  const [input, setInput] = useState("");
  const [policeInput, setPoliceInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [policeLoading, setPoliceLoading] = useState(false);
  const [emergencyLoading, setEmergencyLoading] = useState(false);
  const [boFormOpen, setBoFormOpen] = useState(false);
  const [boLoading, setBoLoading] = useState(false);
  const [notification, setNotification] = useState<{ show: boolean; title: string; message: string } | null>(null);
  const [boData, setBoData] = useState({
    fullName: "",
    cpf: "",
    phone: "",
    address: "",
    incidentType: "violencia_domestica",
    dateTime: "",
    description: "",
    location: ""
  });
  const chatEndRef = useRef<HTMLDivElement>(null);
  const policeChatEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const scrollPoliceToBottom = () => {
    policeChatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const resetApp = () => {
    setCurrentScreen(0);
    setChatOpen(false);
    setPoliceChatOpen(false);
    setBoFormOpen(false);
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    scrollPoliceToBottom();
  }, [policeMessages]);

  // Listen to police report updates
  useEffect(() => {
    if (policeReportId) {
      const unsub = onSnapshot(doc(db, "police_reports", policeReportId), (doc) => {
        if (doc.exists()) {
          const data = doc.data();
          setPoliceMessages(data.messages || []);
        }
      });
      return () => unsub();
    }
  }, [policeReportId]);

  const handleLogin = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (error: any) {
      if (error.code === 'auth/popup-closed-by-user') {
        console.log("Login popup closed by user.");
      } else {
        console.error("Login error:", error);
      }
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      setCurrentScreen(0);
      setPoliceChatOpen(false);
      setPoliceReportId(null);
    } catch (error) {
      console.error("Logout error:", error);
    }
  };

  const getLocation = (): Promise<{ lat: number; lng: number }> => {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error("Geolocalização não suportada"));
      } else {
        navigator.geolocation.getCurrentPosition(
          (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
          (err) => reject(err)
        );
      }
    });
  };

  const startPoliceChat = async (type: "violencia" | "crianca_desaparecida") => {
    if (!user) {
      alert("Por favor, faça login para iniciar um chat com a polícia.");
      return;
    }

    setPoliceChatType(type);
    setPoliceLoading(true);

    try {
      const location = await getLocation().catch(() => null);
      const initialMessage = {
        sender: "police",
        text: type === "violencia" 
          ? "Polícia Civil - Central de Atendimento à Mulher. Como podemos ajudar? Sua localização já foi compartilhada para sua segurança."
          : "Polícia Civil - Central de Busca de Crianças Desaparecidas. Por favor, informe os detalhes. Sua localização está sendo monitorada.",
        timestamp: new Date(),
        location
      };

      const reportRef = await addDoc(collection(db, "police_reports"), {
        uid: user.uid,
        type,
        status: "open",
        createdAt: serverTimestamp(),
        messages: [initialMessage]
      });

      setPoliceReportId(reportRef.id);
      setPoliceChatOpen(true);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, "police_reports");
    } finally {
      setPoliceLoading(false);
    }
  };

  const handleBoSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setBoLoading(true);
    try {
      const boletim = {
        uid: user.uid,
        personalData: {
          fullName: boData.fullName,
          cpf: boData.cpf,
          phone: boData.phone,
          address: boData.address
        },
        reportData: {
          incidentType: boData.incidentType,
          dateTime: boData.dateTime,
          description: boData.description,
          location: boData.location
        },
        status: "registered",
        createdAt: serverTimestamp()
      };
      await addDoc(collection(db, "boletins"), boletim);
      setBoFormOpen(false);
      setNotification({
        show: true,
        title: "B.O. Registrado!",
        message: "Seu Boletim de Ocorrência foi registrado com sucesso. Você receberá atualizações em breve."
      });
      // Clear form
      setBoData({
        fullName: "",
        cpf: "",
        phone: "",
        address: "",
        incidentType: "violencia_domestica",
        dateTime: "",
        description: "",
        location: ""
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, "boletins");
    } finally {
      setBoLoading(false);
    }
  };

  const sendPoliceMessage = async (text: string, includeLocation = false) => {
    if (!policeReportId || !user) return;

    let location = null;
    if (includeLocation) {
      location = await getLocation().catch(() => null);
    }

    const newMessage = {
      sender: "user",
      text,
      timestamp: new Date(),
      location
    };

    try {
      await updateDoc(doc(db, "police_reports", policeReportId), {
        messages: arrayUnion(newMessage)
      });
      setPoliceInput("");

      // Simulate police response
      setTimeout(async () => {
        const policeResponse = {
          sender: "police",
          text: "Recebemos sua informação. Uma equipe está sendo orientada com base nos seus dados.",
          timestamp: new Date()
        };
        await updateDoc(doc(db, "police_reports", policeReportId), {
          messages: arrayUnion(policeResponse)
        });
      }, 2000);

    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, "police_reports");
    }
  };

  const handleEmergency = async () => {
    if (!user) {
      alert("Por favor, faça login para usar o botão de emergência.");
      return;
    }

    // Trigger phone call
    window.location.href = "tel:190";

    setEmergencyLoading(true);
    try {
      const alertData = {
        uid: user.uid,
        timestamp: serverTimestamp(),
        status: "active",
        location: await getLocation().catch(() => null)
      };
      await addDoc(collection(db, "alerts"), alertData);
      alert("Chamada iniciada. Registramos seu alerta no sistema para acompanhamento prioritário.");
      
      // Automatically open the police chat for further details
      startPoliceChat("violencia");
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, "alerts");
    } finally {
      setEmergencyLoading(false);
    }
  };

  const handleCallAndReport = async (type: "violencia" | "crianca_desaparecida") => {
    if (!user) {
      alert("Por favor, faça login para realizar esta ação.");
      return;
    }

    // Trigger phone call
    window.location.href = "tel:190";

    // Start police chat/report after call
    setTimeout(() => {
      startPoliceChat(type);
    }, 1000);
  };

  const handleSend = async () => {
    if (!input.trim() || loading) return;

    const userMsg = input.trim();
    setInput("");
    setMessages(prev => [...prev, { role: "user", text: userMsg }]);
    setLoading(true);

    try {
      const response = await getChatResponse(userMsg, messages);
      setMessages(prev => [...prev, { role: "model", text: response }]);
    } catch (error) {
      console.error("Chat error:", error);
      setMessages(prev => [...prev, { role: "model", text: "Desculpe, tive um problema ao processar sua mensagem. Tente novamente." }]);
    } finally {
      setLoading(false);
    }
  };

  const screens: Screen[] = [
    {
      id: 0,
      title: "Início",
      content: (
        <div className="flex flex-col h-full items-center justify-center space-y-12 py-10">
          {/* Logo Section */}
          <motion.div 
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="flex flex-col items-center space-y-4"
          >
            <div className="w-32 h-32 bg-purple-600 rounded-[3rem] flex items-center justify-center shadow-2xl shadow-purple-900/40 border-4 border-purple-500/30">
              <ShieldAlert className="w-16 h-16 text-white" />
            </div>
            <div className="text-center">
              <h1 className="text-3xl font-black tracking-tighter text-white">SMART SAMPA</h1>
              <p className="text-purple-400 font-bold tracking-[0.3em] text-xs">DA MULHER</p>
            </div>
          </motion.div>

          {/* Action Buttons */}
          <div className="w-full space-y-4 px-4">
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => setBoFormOpen(true)}
              className="w-full bg-white text-purple-900 p-6 rounded-[2rem] font-black text-xl shadow-xl flex items-center justify-center space-x-3"
            >
              <FileText className="w-6 h-6" />
              <span>ABRIR BOLETIM</span>
            </motion.button>

            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => setCurrentScreen(1)}
              className="w-full bg-purple-900/40 border-2 border-purple-500/30 text-white p-6 rounded-[2rem] font-bold text-lg flex items-center justify-center space-x-3"
            >
              <span>ACESSAR PAINEL</span>
              <ChevronLeft className="w-5 h-5 rotate-180" />
            </motion.button>
          </div>

          <p className="text-white/20 text-[10px] font-bold uppercase tracking-widest mt-auto">
            Prefeitura de São Paulo • Segurança
          </p>
        </div>
      ),
      showNext: false
    },
    {
      id: 1,
      title: "Smart Sampa da Mulher",
      subtitle: "Segurança e Proteção",
      content: (
        <div className="flex flex-col h-full py-4 space-y-6">
          {/* Main Emergency Button */}
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={handleEmergency}
            disabled={emergencyLoading}
            className="w-full bg-red-600 p-8 rounded-[2.5rem] shadow-2xl shadow-red-900/40 flex flex-col items-center justify-center space-y-4 border-4 border-red-500/30"
          >
            <div className="w-20 h-20 bg-white/20 rounded-full flex items-center justify-center animate-pulse">
              <AlertCircle className="w-12 h-12 text-white" />
            </div>
            <div className="text-center">
              <h3 className="text-2xl font-black tracking-tighter">EMERGÊNCIA 190</h3>
              <p className="text-xs font-bold text-white/60 uppercase">Ligar e Registrar Alerta</p>
            </div>
          </motion.button>

          {/* Secondary Actions */}
          <div className="grid grid-cols-1 gap-4">
            <motion.button 
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => setBoFormOpen(true)}
              className="bg-zinc-900/60 border border-white/10 p-6 rounded-[2rem] flex items-center space-x-6 text-left group transition-all hover:bg-zinc-900/80"
            >
              <div className="w-16 h-16 bg-white/5 rounded-2xl flex items-center justify-center group-hover:bg-white/10 transition-colors">
                <FileText className="w-8 h-8 text-white/60" />
              </div>
              <div className="flex-1">
                <h4 className="font-bold text-lg">Abrir Boletim (B.O.)</h4>
                <p className="text-[10px] text-white/40 font-bold uppercase tracking-widest">Registro Digital Completo</p>
              </div>
              <ChevronLeft className="w-5 h-5 rotate-180 text-white/20" />
            </motion.button>

            <motion.button 
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => handleCallAndReport("violencia")}
              disabled={policeLoading}
              className="bg-purple-900/40 border border-purple-500/30 p-6 rounded-[2rem] flex items-center space-x-6 text-left group transition-all hover:bg-purple-900/60"
            >
              <div className="w-16 h-16 bg-purple-500/20 rounded-2xl flex items-center justify-center group-hover:bg-purple-500/30 transition-colors">
                <ShieldAlert className="w-8 h-8 text-purple-400" />
              </div>
              <div className="flex-1">
                <h4 className="font-bold text-lg">Violência contra Mulher</h4>
                <p className="text-[10px] text-purple-200/50 font-bold uppercase tracking-widest">Ligar 190 + Denúncia</p>
              </div>
              <Phone className="w-5 h-5 text-purple-500/50" />
            </motion.button>

            <motion.button 
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => handleCallAndReport("crianca_desaparecida")}
              disabled={policeLoading}
              className="bg-blue-900/40 border border-blue-500/30 p-6 rounded-[2rem] flex items-center space-x-6 text-left group transition-all hover:bg-blue-900/60"
            >
              <div className="w-16 h-16 bg-blue-500/20 rounded-2xl flex items-center justify-center group-hover:bg-blue-500/30 transition-colors">
                <Users className="w-8 h-8 text-blue-400" />
              </div>
              <div className="flex-1">
                <h4 className="font-bold text-lg">Pessoas Desaparecidas</h4>
                <p className="text-[10px] text-blue-200/50 font-bold uppercase tracking-widest">Ligar 190 + Registro</p>
              </div>
              <Phone className="w-5 h-5 text-blue-500/50" />
            </motion.button>
          </div>

          {/* Quick Chat with AI */}
          <button 
            onClick={() => setChatOpen(true)}
            className="mt-auto py-4 flex items-center justify-center space-x-2 text-white/30 hover:text-purple-400 transition-colors text-sm font-medium"
          >
            <MessageCircle className="w-4 h-4" />
            <span>Dúvidas? Fale com nossa IA</span>
          </button>
        </div>
      ),
      showNext: false
    }
  ];

  const next = () => {
    if (currentScreen < screens.length - 1) {
      setCurrentScreen(currentScreen + 1);
    } else {
      setCurrentScreen(0);
    }
  };

  const back = () => {
    if (currentScreen > 0) {
      setCurrentScreen(currentScreen - 1);
    }
  };

  return (
    <div className="min-h-screen bg-black text-white font-sans selection:bg-purple-500/30 flex items-center justify-center p-4">
      {/* Phone Container */}
      <div className="w-full max-w-[400px] h-[800px] bg-gradient-to-b from-purple-950 to-black rounded-[3rem] border-[8px] border-zinc-900 shadow-2xl overflow-hidden relative flex flex-col">
        
        {/* Status Bar */}
        <div className="h-10 flex items-center justify-between px-8 pt-4">
          <span className="text-xs font-medium">9:41</span>
          <div className="flex items-center space-x-1.5">
            <div className="w-4 h-2.5 border border-white/40 rounded-sm"></div>
            <div className="w-3 h-3 bg-white rounded-full"></div>
          </div>
        </div>

        {/* Header */}
        <div className="px-6 py-4 flex items-center justify-between">
          <div className="w-10">
            {(currentScreen > 0 || chatOpen || policeChatOpen || boFormOpen) ? (
              <button 
                onClick={resetApp}
                className="p-2 hover:bg-white/10 rounded-full transition-colors text-purple-400"
                title="Voltar ao Início"
              >
                <HomeIcon className="w-6 h-6" />
              </button>
            ) : null}
          </div>
          <h2 className="flex-1 text-center font-bold text-lg">
            {screens[currentScreen].title}
          </h2>
          <div className="w-10 flex justify-end">
            {user ? (
              <button onClick={handleLogout} className="p-2 hover:bg-white/10 rounded-full transition-colors text-purple-400">
                <LogOut className="w-5 h-5" />
              </button>
            ) : (
              <button onClick={handleLogin} className="p-2 hover:bg-white/10 rounded-full transition-colors text-purple-400">
                <LogIn className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>

        {/* User Profile Info (if logged in) */}
        {user && (
          <div className="px-6 py-2 flex items-center space-x-3 bg-purple-900/10 border-y border-white/5">
            <div className="w-8 h-8 bg-purple-500 rounded-full flex items-center justify-center overflow-hidden">
              {user.photoURL ? (
                <img src={user.photoURL} alt="User" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
              ) : (
                <UserIcon className="w-4 h-4 text-white" />
              )}
            </div>
            <div className="flex-1 overflow-hidden">
              <p className="text-xs font-bold truncate">{user.displayName}</p>
              <p className="text-[10px] text-white/40 truncate">{user.email}</p>
            </div>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 px-6 overflow-y-auto relative">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentScreen}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3 }}
              className="h-full"
            >
              {screens[currentScreen].content}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Footer Button */}
        {screens[currentScreen].showNext && (
          <div className="p-6 pb-12">
            <button
              onClick={next}
              className="w-full py-4 bg-gradient-to-r from-purple-600 to-purple-800 rounded-2xl font-bold text-lg shadow-lg shadow-purple-900/20 active:scale-95 transition-transform"
            >
              {screens[currentScreen].nextText}
            </button>
          </div>
        )}

        {/* Floating Chat Button */}
        <motion.button
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          onClick={() => setChatOpen(true)}
          className="absolute bottom-28 right-6 w-14 h-14 bg-purple-500 rounded-full flex items-center justify-center shadow-xl shadow-purple-500/20 z-10"
        >
          <MessageCircle className="w-7 h-7 text-white" />
        </motion.button>

        {/* Chat Overlay */}
        <AnimatePresence>
          {chatOpen && (
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="absolute inset-0 bg-zinc-950 z-20 flex flex-col"
            >
              <div className="p-6 border-b border-white/10 flex items-center justify-between bg-purple-900/20">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 bg-purple-500 rounded-full flex items-center justify-center">
                    <Cpu className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h3 className="font-bold">Assistente IA</h3>
                    <p className="text-[10px] text-purple-400 uppercase font-bold tracking-widest">Online</p>
                  </div>
                </div>
                <button 
                  onClick={() => setChatOpen(false)}
                  className="p-2 hover:bg-white/10 rounded-full transition-colors"
                >
                  <ChevronLeft className="w-6 h-6 rotate-270" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                {messages.length === 0 && (
                  <div className="text-center py-12 space-y-4">
                    <MessageCircle className="w-12 h-12 text-purple-500/40 mx-auto" />
                    <p className="text-white/40 text-sm px-8">
                      Olá! Sou a inteligência artificial do Smart Sampa. Como posso ajudar você hoje?
                    </p>
                  </div>
                )}
                {messages.map((msg, i) => (
                  <div 
                    key={i}
                    className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                  >
                    <div className={`max-w-[80%] p-4 rounded-2xl ${
                      msg.role === "user" 
                        ? "bg-purple-600 text-white rounded-tr-none" 
                        : "bg-zinc-900 text-white/90 rounded-tl-none border border-white/5"
                    }`}>
                      <p className="text-sm leading-relaxed">{msg.text}</p>
                    </div>
                  </div>
                ))}
                {loading && (
                  <div className="flex justify-start">
                    <div className="bg-zinc-900 p-4 rounded-2xl rounded-tl-none border border-white/5">
                      <Loader2 className="w-5 h-5 animate-spin text-purple-500" />
                    </div>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>

              <div className="p-6 border-t border-white/10 bg-black">
                <div className="flex items-center space-x-2 bg-zinc-900 rounded-2xl p-2 pl-4 border border-white/5">
                  <input 
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyPress={(e) => e.key === "Enter" && handleSend()}
                    placeholder="Digite sua mensagem..."
                    className="flex-1 bg-transparent border-none focus:ring-0 text-sm py-2"
                  />
                  <button 
                    onClick={handleSend}
                    disabled={loading || !input.trim()}
                    className="p-2 bg-purple-500 rounded-xl hover:bg-purple-600 disabled:opacity-50 transition-colors"
                  >
                    <Send className="w-5 h-5" />
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Police Chat Overlay */}
        <AnimatePresence>
          {policeChatOpen && (
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="absolute inset-0 bg-zinc-950 z-30 flex flex-col"
            >
              <div className="p-6 border-b border-white/10 flex items-center justify-between bg-blue-900/20">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center">
                    <ShieldCheck className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h3 className="font-bold text-sm">Polícia Civil SP</h3>
                    <p className="text-[10px] text-blue-400 uppercase font-bold tracking-widest">Canal de Emergência</p>
                  </div>
                </div>
                <button 
                  onClick={() => setPoliceChatOpen(false)}
                  className="p-2 hover:bg-white/10 rounded-full transition-colors"
                >
                  <ChevronLeft className="w-6 h-6" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                {policeMessages.map((msg, i) => (
                  <div 
                    key={i}
                    className={`flex ${msg.sender === "user" ? "justify-end" : "justify-start"}`}
                  >
                    <div className={`max-w-[85%] p-4 rounded-2xl ${
                      msg.sender === "user" 
                        ? "bg-blue-600 text-white rounded-tr-none shadow-lg shadow-blue-900/20" 
                        : "bg-zinc-900 text-white/90 rounded-tl-none border border-white/5"
                    }`}>
                      <p className="text-sm leading-relaxed">{msg.text}</p>
                      {msg.location && (
                        <div className="mt-2 pt-2 border-t border-white/10 flex items-center space-x-2 text-[10px] opacity-70">
                          <MapPin className="w-3 h-3" />
                          <span>Localização enviada: {msg.location.lat.toFixed(4)}, {msg.location.lng.toFixed(4)}</span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                <div ref={policeChatEndRef} />
              </div>

              <div className="p-6 border-t border-white/10 bg-black space-y-4">
                <div className="flex items-center justify-between">
                  <button 
                    onClick={() => sendPoliceMessage("Compartilhando minha localização atual...", true)}
                    className="flex items-center space-x-2 text-xs font-bold text-blue-400 bg-blue-500/10 px-4 py-2 rounded-full border border-blue-500/20"
                  >
                    <MapPin className="w-4 h-4" />
                    <span>Enviar Localização</span>
                  </button>
                  <button className="p-2 bg-red-500/20 text-red-400 rounded-full border border-red-500/20">
                    <Phone className="w-4 h-4" />
                  </button>
                </div>
                <div className="flex items-center space-x-2 bg-zinc-900 rounded-2xl p-2 pl-4 border border-white/5">
                  <input 
                    type="text"
                    value={policeInput}
                    onChange={(e) => setPoliceInput(e.target.value)}
                    onKeyPress={(e) => e.key === "Enter" && sendPoliceMessage(policeInput)}
                    placeholder="Descreva a situação..."
                    className="flex-1 bg-transparent border-none focus:ring-0 text-sm py-2"
                  />
                  <button 
                    onClick={() => sendPoliceMessage(policeInput)}
                    disabled={!policeInput.trim()}
                    className="p-2 bg-blue-600 rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-colors"
                  >
                    <Send className="w-5 h-5" />
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Boletim de Ocorrência Form Overlay */}
        <AnimatePresence>
          {boFormOpen && (
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="absolute inset-0 bg-zinc-950 z-40 flex flex-col"
            >
              <div className="p-6 border-b border-white/10 flex items-center justify-between bg-zinc-900/50">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 bg-white/10 rounded-full flex items-center justify-center">
                    <FileText className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h3 className="font-bold">Boletim Digital</h3>
                    <p className="text-[10px] text-white/40 uppercase font-bold tracking-widest">Registro Oficial</p>
                  </div>
                </div>
                <button 
                  onClick={() => setBoFormOpen(false)}
                  className="p-2 hover:bg-white/10 rounded-full transition-colors"
                >
                  <ChevronLeft className="w-6 h-6 rotate-270" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6">
                <form onSubmit={handleBoSubmit} className="space-y-8">
                  {/* Personal Data Section */}
                  <div className="space-y-4">
                    <h4 className="text-xs font-bold text-purple-400 uppercase tracking-widest flex items-center space-x-2">
                      <UserIcon className="w-3 h-3" />
                      <span>Dados Pessoais</span>
                    </h4>
                    <div className="space-y-3">
                      <div className="relative">
                        <UserIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
                        <input 
                          required
                          type="text"
                          placeholder="Nome Completo"
                          value={boData.fullName}
                          onChange={(e) => setBoData({...boData, fullName: e.target.value})}
                          className="w-full bg-white/5 border border-white/10 rounded-2xl py-3 pl-12 pr-4 text-sm focus:border-purple-500 transition-colors"
                        />
                      </div>
                      <div className="relative">
                        <CreditCard className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
                        <input 
                          required
                          type="text"
                          placeholder="CPF"
                          value={boData.cpf}
                          onChange={(e) => setBoData({...boData, cpf: e.target.value})}
                          className="w-full bg-white/5 border border-white/10 rounded-2xl py-3 pl-12 pr-4 text-sm focus:border-purple-500 transition-colors"
                        />
                      </div>
                      <div className="relative">
                        <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
                        <input 
                          required
                          type="tel"
                          placeholder="Telefone"
                          value={boData.phone}
                          onChange={(e) => setBoData({...boData, phone: e.target.value})}
                          className="w-full bg-white/5 border border-white/10 rounded-2xl py-3 pl-12 pr-4 text-sm focus:border-purple-500 transition-colors"
                        />
                      </div>
                      <div className="relative">
                        <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
                        <input 
                          required
                          type="text"
                          placeholder="Endereço Residencial"
                          value={boData.address}
                          onChange={(e) => setBoData({...boData, address: e.target.value})}
                          className="w-full bg-white/5 border border-white/10 rounded-2xl py-3 pl-12 pr-4 text-sm focus:border-purple-500 transition-colors"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Incident Data Section */}
                  <div className="space-y-4">
                    <h4 className="text-xs font-bold text-purple-400 uppercase tracking-widest flex items-center space-x-2">
                      <ShieldAlert className="w-3 h-3" />
                      <span>Dados da Ocorrência</span>
                    </h4>
                    <div className="space-y-3">
                      <select 
                        required
                        value={boData.incidentType}
                        onChange={(e) => setBoData({...boData, incidentType: e.target.value})}
                        className="w-full bg-white/5 border border-white/10 rounded-2xl py-3 px-4 text-sm focus:border-purple-500 transition-colors appearance-none"
                      >
                        <option value="violencia_domestica">Violência Doméstica</option>
                        <option value="assedio">Assédio</option>
                        <option value="ameaca">Ameaça</option>
                        <option value="desaparecimento">Desaparecimento</option>
                        <option value="outro">Outro</option>
                      </select>
                      <div className="relative">
                        <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
                        <input 
                          required
                          type="datetime-local"
                          value={boData.dateTime}
                          onChange={(e) => setBoData({...boData, dateTime: e.target.value})}
                          className="w-full bg-white/5 border border-white/10 rounded-2xl py-3 pl-12 pr-4 text-sm focus:border-purple-500 transition-colors"
                        />
                      </div>
                      <div className="relative">
                        <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
                        <input 
                          required
                          type="text"
                          placeholder="Local do Fato"
                          value={boData.location}
                          onChange={(e) => setBoData({...boData, location: e.target.value})}
                          className="w-full bg-white/5 border border-white/10 rounded-2xl py-3 pl-12 pr-4 text-sm focus:border-purple-500 transition-colors"
                        />
                      </div>
                      <textarea 
                        required
                        placeholder="Descrição detalhada do ocorrido..."
                        value={boData.description}
                        onChange={(e) => setBoData({...boData, description: e.target.value})}
                        className="w-full bg-white/5 border border-white/10 rounded-2xl py-3 px-4 text-sm focus:border-purple-500 transition-colors min-h-[120px] resize-none"
                      />
                    </div>
                  </div>

                  <button 
                    type="submit"
                    disabled={boLoading}
                    className="w-full py-4 bg-purple-600 hover:bg-purple-700 rounded-2xl font-bold text-lg shadow-lg shadow-purple-900/20 flex items-center justify-center space-x-2 transition-all active:scale-95 disabled:opacity-50"
                  >
                    {boLoading ? <Loader2 className="w-6 h-6 animate-spin" /> : <FileText className="w-6 h-6" />}
                    <span>REGISTRAR B.O.</span>
                  </button>
                </form>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Notification Toast */}
        <AnimatePresence>
          {notification?.show && (
            <motion.div
              initial={{ y: -100, opacity: 0 }}
              animate={{ y: 20, opacity: 1 }}
              exit={{ y: -100, opacity: 0 }}
              className="absolute top-4 left-6 right-6 bg-green-600 p-4 rounded-2xl shadow-2xl z-50 flex items-start space-x-4 border border-green-500/30"
            >
              <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center shrink-0">
                <Bell className="w-6 h-6 text-white" />
              </div>
              <div className="flex-1">
                <h5 className="font-bold text-sm">{notification.title}</h5>
                <p className="text-xs text-white/80 leading-tight mt-1">{notification.message}</p>
              </div>
              <button 
                onClick={() => setNotification(null)}
                className="p-1 hover:bg-white/10 rounded-full"
              >
                <ChevronLeft className="w-4 h-4 rotate-90" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Home Indicator */}
        <div className="h-1.5 w-32 bg-white/20 rounded-full mx-auto mb-2 mt-auto"></div>
      </div>
    </div>
  );
}
