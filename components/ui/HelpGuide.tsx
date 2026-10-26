'use client';

import { useState } from 'react';
import { HelpCircle, X, ChevronLeft, ChevronRight, Lightbulb } from 'lucide-react';
import styles from './HelpGuide.module.css';

export interface HelpStep {
  icon: string;       // emoji
  title: string;
  description: string;
  tips?: string[];
}

export interface HelpContent {
  featureTitle: string;
  subtitle: string;
  steps: HelpStep[];
  generalTips?: string[];
}

interface HelpGuideProps {
  content: HelpContent;
}

export default function HelpGuide({ content }: HelpGuideProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [viewMode, setViewMode] = useState<'steps' | 'all'>('steps');

  const totalSteps = content.steps.length;
  const step = content.steps[currentStep];

  function handleNext() {
    if (currentStep < totalSteps - 1) setCurrentStep(p => p + 1);
  }

  function handlePrev() {
    if (currentStep > 0) setCurrentStep(p => p - 1);
  }

  function handleOpen() {
    setCurrentStep(0);
    setIsOpen(true);
  }

  return (
    <>
      {/* 使用說明按鈕 */}
      <button
        type="button"
        className={styles.helpBtn}
        onClick={handleOpen}
        aria-label="使用說明"
        title="使用說明"
      >
        <HelpCircle size={18} />
      </button>

      {/* Modal */}
      {isOpen && (
        <div
          className={styles.backdrop}
          onClick={(e) => { if (e.target === e.currentTarget) setIsOpen(false); }}
        >
          <div className={styles.modal} role="dialog" aria-modal="true">
            {/* 標題列 */}
            <div className={styles.header}>
              <div>
                <h3 className={styles.title}>
                  <HelpCircle size={20} className={styles.titleIcon} />
                  {content.featureTitle}
                </h3>
                <p className={styles.subtitle}>{content.subtitle}</p>
              </div>
              <button
                type="button"
                className={styles.closeBtn}
                onClick={() => setIsOpen(false)}
                aria-label="關閉"
              >
                <X size={20} />
              </button>
            </div>

            {/* 視圖切換 */}
            <div className={styles.viewSwitch}>
              <button
                type="button"
                className={`${styles.viewBtn} ${viewMode === 'steps' ? styles.viewBtnActive : ''}`}
                onClick={() => setViewMode('steps')}
              >
                逐步導覽
              </button>
              <button
                type="button"
                className={`${styles.viewBtn} ${viewMode === 'all' ? styles.viewBtnActive : ''}`}
                onClick={() => setViewMode('all')}
              >
                完整說明
              </button>
            </div>

            {/* 逐步導覽模式 */}
            {viewMode === 'steps' && (
              <div className={styles.stepView}>
                {/* 進度指示 */}
                <div className={styles.progressBar}>
                  {content.steps.map((_, idx) => (
                    <div
                      key={idx}
                      className={`${styles.progressDot} ${idx === currentStep ? styles.progressDotActive : ''} ${idx < currentStep ? styles.progressDotDone : ''}`}
                      onClick={() => setCurrentStep(idx)}
                    />
                  ))}
                </div>
                <div className={styles.stepCounter}>
                  步驟 {currentStep + 1} / {totalSteps}
                </div>

                {/* 步驟卡片 */}
                <div className={styles.stepCard}>
                  <div className={styles.stepIcon}>{step.icon}</div>
                  <h4 className={styles.stepTitle}>{step.title}</h4>
                  <p className={styles.stepDesc}>{step.description}</p>
                  {step.tips && step.tips.length > 0 && (
                    <div className={styles.stepTips}>
                      <Lightbulb size={14} className={styles.tipIcon} />
                      <div>
                        {step.tips.map((tip, i) => (
                          <p key={i} className={styles.tipText}>{tip}</p>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* 導覽按鈕 */}
                <div className={styles.navBtns}>
                  <button
                    type="button"
                    className={styles.navBtn}
                    onClick={handlePrev}
                    disabled={currentStep === 0}
                  >
                    <ChevronLeft size={16} />
                    上一步
                  </button>
                  {currentStep < totalSteps - 1 ? (
                    <button
                      type="button"
                      className={`${styles.navBtn} ${styles.navBtnPrimary}`}
                      onClick={handleNext}
                    >
                      下一步
                      <ChevronRight size={16} />
                    </button>
                  ) : (
                    <button
                      type="button"
                      className={`${styles.navBtn} ${styles.navBtnPrimary}`}
                      onClick={() => setIsOpen(false)}
                    >
                      ✅ 完成
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* 完整說明模式 */}
            {viewMode === 'all' && (
              <div className={styles.allView}>
                {content.steps.map((s, idx) => (
                  <div key={idx} className={styles.allStep}>
                    <div className={styles.allStepNum}>{idx + 1}</div>
                    <div className={styles.allStepContent}>
                      <div className={styles.allStepHeader}>
                        <span className={styles.allStepIcon}>{s.icon}</span>
                        <h4 className={styles.allStepTitle}>{s.title}</h4>
                      </div>
                      <p className={styles.allStepDesc}>{s.description}</p>
                      {s.tips && s.tips.length > 0 && (
                        <div className={styles.stepTips}>
                          <Lightbulb size={12} className={styles.tipIcon} />
                          <div>
                            {s.tips.map((tip, i) => (
                              <p key={i} className={styles.tipText}>{tip}</p>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ))}

                {/* 一般提示 */}
                {content.generalTips && content.generalTips.length > 0 && (
                  <div className={styles.generalTips}>
                    <h4 className={styles.generalTipsTitle}>
                      <Lightbulb size={16} />
                      實用小技巧
                    </h4>
                    <ul className={styles.generalTipsList}>
                      {content.generalTips.map((tip, i) => (
                        <li key={i}>{tip}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
