# backend/app/features/scoring/utils.py

def apply_stalled_qrs_recovery(qrs_score: float, ml_score: float, rule_score: float) -> float:
    """
    P0 SAFETY: If QRS is exactly ~50 while ML is high/low, it usually means 
    calibration or rule engine is 'stalled'.
    
    If calibrated score is stuck near 50 but raw ML was very high (>80) or 
    very low (<20), we favor the raw ML score to ensure the user gets a signal.
    
    Formula: 0.8 weight to raw ML to break the 50.0 plateau effectively.
    """
    if ml_score is None:
        return qrs_score
        
    is_stalled = (abs(qrs_score - 50.0) < 0.1)
    ml_is_strong = (ml_score > 80 or ml_score < 20)
    
    if is_stalled and ml_is_strong:
        # Unified recovery formula (v4.2.6 standard)
        return 0.8 * ml_score + 0.2 * rule_score
        
    return qrs_score
