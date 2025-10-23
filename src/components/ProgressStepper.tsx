import { motion } from 'framer-motion';
import { Check, User, Package, FileText, Download } from 'lucide-react';

interface ProgressStepperProps {
  currentStep: number;
  onStepClick?: (step: number) => void;
}

const steps = [
  {
    id: 1,
    name: 'Client Details',
    description: 'Enter client information',
    icon: User,
    path: '/'
  },
  {
    id: 2,
    name: 'Modules',
    description: 'Add services & pricing',
    icon: Package,
    path: '/modules'
  },
  {
    id: 3,
    name: 'Summary',
    description: 'Review & configure',
    icon: FileText,
    path: '/summary'
  },
  {
    id: 4,
    name: 'PDF Preview',
    description: 'Generate & download',
    icon: Download,
    path: '/pdf-preview'
  }
];

export default function ProgressStepper({ currentStep, onStepClick }: ProgressStepperProps) {
  return (
    <div className="w-full">
      {/* Mobile: Vertical layout for small screens */}
      <div className="block sm:hidden">
        <div className="space-y-4">
          {steps.map((step, index) => {
            const isCompleted = currentStep > step.id;
            const isCurrent = currentStep === step.id;
            const isClickable = onStepClick && (isCompleted || isCurrent);
            
            const Icon = step.icon;
            
            return (
              <div key={step.id} className="flex items-center space-x-4">
                {/* Step circle */}
                <motion.div
                  whileHover={isClickable ? { scale: 1.1 } : {}}
                  whileTap={isClickable ? { scale: 0.95 } : {}}
                  onClick={isClickable ? () => onStepClick?.(step.id) : undefined}
                  className={`
                    relative z-10 w-10 h-10 rounded-full flex items-center justify-center transition-all duration-300 cursor-pointer flex-shrink-0
                    ${isCompleted 
                      ? 'bg-green-500 text-white shadow-lg' 
                      : isCurrent 
                      ? 'bg-blue-600 text-white shadow-lg ring-4 ring-blue-200' 
                      : 'bg-gray-200 text-gray-400'
                    }
                    ${isClickable ? 'hover:shadow-md' : ''}
                  `}
                >
                  {isCompleted ? (
                    <Check className="w-5 h-5" />
                  ) : (
                    <Icon className="w-5 h-5" />
                  )}
                </motion.div>
                
                {/* Step info */}
                <div className="flex-1">
                  <div className={`
                    text-sm font-medium transition-colors duration-300
                    ${isCurrent ? 'text-blue-600' : isCompleted ? 'text-green-600' : 'text-gray-500'}
                  `}>
                    {step.name}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    {step.description}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Desktop: Horizontal layout for larger screens */}
      <div className="hidden sm:flex items-center justify-between">
        {steps.map((step, index) => {
          const isCompleted = currentStep > step.id;
          const isCurrent = currentStep === step.id;
          const isClickable = onStepClick && (isCompleted || isCurrent);
          
          const Icon = step.icon;
          
          return (
            <div key={step.id} className="flex flex-col items-center relative">
              {/* Connector line */}
              {index < steps.length - 1 && (
                <div className="absolute top-6 left-1/2 w-full h-0.5 bg-gray-200 -translate-x-1/2 z-0">
                  <motion.div
                    className="h-full bg-blue-600"
                    initial={{ width: 0 }}
                    animate={{ width: isCompleted ? '100%' : '0%' }}
                    transition={{ duration: 0.3 }}
                  />
                </div>
              )}
              
              {/* Step circle */}
              <motion.div
                whileHover={isClickable ? { scale: 1.1 } : {}}
                whileTap={isClickable ? { scale: 0.95 } : {}}
                onClick={isClickable ? () => onStepClick?.(step.id) : undefined}
                className={`
                  relative z-10 w-12 h-12 rounded-full flex items-center justify-center transition-all duration-300 cursor-pointer
                  ${isCompleted 
                    ? 'bg-green-500 text-white shadow-lg' 
                    : isCurrent 
                    ? 'bg-blue-600 text-white shadow-lg ring-4 ring-blue-200' 
                    : 'bg-gray-200 text-gray-400'
                  }
                  ${isClickable ? 'hover:shadow-md' : ''}
                `}
              >
                {isCompleted ? (
                  <Check className="w-6 h-6" />
                ) : (
                  <Icon className="w-6 h-6" />
                )}
              </motion.div>
              
              {/* Step info */}
              <div className="mt-3 text-center">
                <div className={`
                  text-sm font-medium transition-colors duration-300
                  ${isCurrent ? 'text-blue-600' : isCompleted ? 'text-green-600' : 'text-gray-500'}
                `}>
                  {step.name}
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  {step.description}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      
      {/* Progress bar */}
      <div className="mt-4 sm:mt-6">
        <div className="w-full bg-gray-200 rounded-full h-2">
          <motion.div
            className="bg-gradient-to-r from-blue-500 to-green-500 h-2 rounded-full"
            initial={{ width: 0 }}
            animate={{ width: `${((currentStep - 1) / (steps.length - 1)) * 100}%` }}
            transition={{ duration: 0.5, ease: 'easeInOut' }}
          />
        </div>
        <div className="flex justify-between mt-2 text-xs text-gray-500">
          <span>Step {currentStep} of {steps.length}</span>
          <span>{Math.round(((currentStep - 1) / (steps.length - 1)) * 100)}% Complete</span>
        </div>
      </div>
    </div>
  );
}
