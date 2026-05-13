import { useEffect, useState, useRef } from "react";
import { ArrowRight, Camera, CheckCircle2, Layout, Video, X, WandSparkles, MousePointer2 } from "lucide-react";
import { useLocation, useNavigate } from "react-router";

type Step = {
  title: string;
  description: string;
  icon: React.ReactNode;
  targetId?: string;
  path?: string;
};

const steps: Step[] = [
  {
    title: "ওভারলে স্টুডিওতে স্বাগতম",
    description: "আপনার যাত্রা শুরু করতে আমরা আপনাকে ছোট একটি ট্যুর দেব। এখানে আপনি আপনার লাইভ স্ট্রিম পরিচালনা করতে পারবেন।",
    icon: <WandSparkles size={32} className="text-[var(--accent-cyan)]" />,
  },
  {
    title: "রুমের সময় কিনুন",
    description: "এখান থেকে আপনি আপনার স্ট্রিমিং প্যাকেজ কিনতে পারবেন। যত সময় কিনবেন, তত বেশি লাইভ করতে পারবেন।",
    icon: <Layout size={32} className="text-[var(--accent-lime)]" />,
    targetId: "walkthrough-purchase-btn",
    path: "/dashboard",
  },
  {
    title: "নতুন রুম তৈরি করুন",
    description: "আপনার ম্যাচের জন্য একটি ডেডিকেটেড রুম তৈরি করুন। এখান থেকে আপনি আপনার রুমের নাম দিয়ে শুরু করতে পারেন।",
    icon: <Video size={32} className="text-[var(--accent-coral)]" />,
    targetId: "walkthrough-create-room-btn",
    path: "/dashboard",
  },
  {
    title: "স্টুডিওতে প্রবেশ করুন",
    description: "রুম তৈরি করার পর 'স্টুডিও' বাটনে ক্লিক করে আপনি ব্রডকাস্ট কন্ট্রোল রুমে প্রবেশ করতে পারবেন।",
    icon: <MousePointer2 size={32} className="text-[var(--accent-cyan)]" />,
    targetId: "walkthrough-studio-btn",
    path: "/dashboard",
  },
  {
    title: "প্রোগ্রাম মিক্সার",
    description: "এটি আপনার মেইন প্রিভিউ উইন্ডো। এখানে আপনি আপনার লাইভ ফিড এবং গ্রাফিক্সের ফাইনাল আউটপুট দেখতে পাবেন।",
    icon: <Video size={32} className="text-[var(--accent-lime)]" />,
    targetId: "walkthrough-program-source",
    path: "/studio",
  },
  {
    title: "ক্যামেরা ম্যানেজমেন্ট",
    description: "এখানে আপনার সব কানেক্টেড ক্যামেরা দেখা যাবে। আপনি সহজেই এক ক্যামেরা থেকে অন্য ক্যামেরায় সুইচ করতে পারবেন।",
    icon: <Camera size={32} className="text-[var(--accent-coral)]" />,
    targetId: "walkthrough-camera-pool",
    path: "/studio",
  },
  {
    title: "গ্রাফিক্স ও স্কোরবোর্ড",
    description: "এখান থেকে আপনি স্কোরবোর্ড, লোগো, স্পন্সর এবং চলন্ত বার্তা (Ticker) নিয়ন্ত্রণ করতে পারবেন।",
    icon: <Layout size={32} className="text-[var(--accent-cyan)]" />,
    targetId: "walkthrough-graphics-panel",
    path: "/studio",
  },
  {
    title: "লাইভ শুরু করুন",
    description: "সবকিছু রেডি হলে 'লাইভ শুরু' বাটনে ক্লিক করে আপনার স্ট্রিম ফেসবুক বা ইউটিউবে পাঠিয়ে দিন।",
    icon: <CheckCircle2 size={32} className="text-[var(--accent-lime)]" />,
    targetId: "walkthrough-go-live-btn",
    path: "/studio",
  },
];

export function Walkthrough() {
  const location = useLocation();
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState(-1);
  const [isVisible, setIsVisible] = useState(false);
  const [spotlight, setSpotlight] = useState<{ top: number; left: number; width: number; height: number } | null>(null);
  const spotlightRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const isNewUser = window.localStorage.getItem("is-new-user");
    const walkthroughSeen = window.localStorage.getItem("walkthrough-seen");
    const savedStep = window.localStorage.getItem("walkthrough-current-step");

    if (isNewUser === "true" && walkthroughSeen !== "true") {
      setIsVisible(true);
      setCurrentStep(savedStep ? parseInt(savedStep) : 0);
    }
  }, []);

  useEffect(() => {
    if (currentStep >= 0 && isVisible) {
      const step = steps[currentStep];
      window.localStorage.setItem("walkthrough-current-step", currentStep.toString());

      if (step.path && location.pathname !== step.path) {
        setSpotlight(null);
        return;
      }

      if (step.targetId) {
        const updateSpotlight = () => {
          const el = document.getElementById(step.targetId!);
          if (el) {
            const rect = el.getBoundingClientRect();
            // Check if element is visible and has dimensions
            if (rect.width > 0 && rect.height > 0) {
              setSpotlight({
                top: rect.top - 8,
                left: rect.left - 8,
                width: rect.width + 16,
                height: rect.height + 16,
              });
              // Only scroll if we are not already looking at it
              if (rect.top < 0 || rect.bottom > window.innerHeight) {
                el.scrollIntoView({ behavior: "smooth", block: "center" });
              }
            } else {
              setSpotlight(null);
            }
          } else {
            setSpotlight(null);
          }
        };

        const interval = setInterval(updateSpotlight, 1000);
        const timeout = setTimeout(updateSpotlight, 300);
        window.addEventListener("resize", updateSpotlight);
        return () => {
          clearInterval(interval);
          clearTimeout(timeout);
          window.removeEventListener("resize", updateSpotlight);
        };
      } else {
        setSpotlight(null);
      }
    }
  }, [currentStep, isVisible, location.pathname]);

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      handleClose();
    }
  };

  const handleClose = () => {
    setIsVisible(false);
    window.localStorage.setItem("walkthrough-seen", "true");
    window.localStorage.removeItem("is-new-user");
    window.localStorage.removeItem("walkthrough-current-step");
  };

  if (!isVisible || currentStep === -1) return null;

  const step = steps[currentStep];
  const isWrongPath = step.path && location.pathname !== step.path;

  // Don't show the walkthrough dialog if we are on the wrong path for a targeted step
  if (isWrongPath && step.targetId) return null;

  return (
    <div className="fixed inset-0 z-[100] pointer-events-none">
      {/* Background Dimming with Hole */}
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-[2px] transition-all duration-500 pointer-events-auto"
        style={{
          clipPath: spotlight 
            ? `polygon(0% 0%, 0% 100%, ${spotlight.left}px 100%, ${spotlight.left}px ${spotlight.top}px, ${spotlight.left + spotlight.width}px ${spotlight.top}px, ${spotlight.left + spotlight.width}px ${spotlight.top + spotlight.height}px, ${spotlight.left}px ${spotlight.top + spotlight.height}px, ${spotlight.left}px 100%, 100% 100%, 100% 0%)`
            : "none"
        }}
        onClick={handleClose}
      />

      {/* Spotlight Border */}
      {spotlight && (
        <div 
          className="absolute border-2 border-[var(--accent-cyan)] rounded-xl shadow-[0_0_20px_rgba(80,216,255,0.5)] transition-all duration-500 animate-pulse"
          style={{
            top: spotlight.top,
            left: spotlight.left,
            width: spotlight.width,
            height: spotlight.height,
          }}
        />
      )}

      {/* Dialog */}
      <div 
        className={`absolute z-[110] w-full max-w-sm pointer-events-auto transition-all duration-500 ${
          spotlight 
            ? "top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" 
            : "top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
        }`}
        style={spotlight ? {
          // Adjust position if spotlight is in the way
          top: spotlight.top > window.innerHeight / 2 ? spotlight.top - 200 : spotlight.top + spotlight.height + 200,
          left: '50%',
          transform: 'translate(-50%, -50%)'
        } : {}}
      >
        <div className="glass-panel rounded-[2rem] p-6 md:p-8 shadow-2xl border border-white/10 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-[var(--accent-cyan)] to-[var(--accent-lime)]" />
          
          <button
            onClick={handleClose}
            className="absolute top-4 right-4 p-1.5 rounded-full hover:bg-white/10 transition-colors text-[var(--text-muted)]"
          >
            <X size={16} />
          </button>

          <div className="flex flex-col items-center text-center">
            <div className="mb-6 p-4 rounded-full bg-white/5 border border-white/5">
              {step.icon}
            </div>

            <div className="mb-3 flex gap-1">
              {steps.map((_, idx) => (
                <div
                  key={idx}
                  className={`h-1 rounded-full transition-all duration-500 ${
                    idx === currentStep ? "w-6 bg-[var(--accent-cyan)]" : "w-1 bg-white/10"
                  }`}
                />
              ))}
            </div>

            <h2 className="text-xl font-black tracking-tight mb-2">{step.title}</h2>
            <p className="text-[var(--text-muted)] text-sm leading-relaxed mb-8">
              {isWrongPath ? `দয়া করে ${step.path === '/studio' ? 'স্টুডিওতে' : 'ড্যাশবোর্ডে'} যান এই ধাপটি দেখতে।` : step.description}
            </p>

            <div className="flex gap-3 w-full">
              <button
                onClick={handleClose}
                className="flex-1 py-3 px-4 rounded-full border border-white/10 text-xs font-bold hover:bg-white/5 transition-all"
              >
                স্কিপ করুন
              </button>
              <button
                onClick={handleNext}
                className="flex-[2] py-3 px-4 bg-[var(--accent-cyan)] text-black font-black rounded-full flex items-center justify-center gap-2 hover:scale-[1.05] active:scale-95 transition-all shadow-lg"
              >
                {currentStep === steps.length - 1 ? "শেষ করুন" : "পরবর্তী"}
                <ArrowRight size={16} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
