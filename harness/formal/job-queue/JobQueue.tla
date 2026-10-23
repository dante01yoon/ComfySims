---------------------------- MODULE JobQueue ----------------------------
EXTENDS Naturals, Sequences, FiniteSets

CONSTANTS
    MaxConcurrentJobs,
    Requests,
    GuardedRequests,
    RetryFrom,
    MaxJobs

ASSUME MaxConcurrentJobs \in Nat \ {0}
ASSUME GuardedRequests \subseteq Requests
ASSUME MaxJobs \in Nat

Phases   == {"queued", "granted", "running", "done", "failed"}
Finished == {"done", "failed"}
Holding  == {"granted", "running"}

VARIABLES
    jobs,
    runningJobs,
    waitingForSlot,
    startedJobs

vars == <<jobs, runningJobs, waitingForSlot, startedJobs>>

Ids == DOMAIN jobs

TypeOK ==
    /\ startedJobs \in 0..MaxJobs
    /\ Ids = 1..startedJobs
    /\ \A j \in Ids : jobs[j].req \in Requests /\ jobs[j].lineage \in Ids /\ jobs[j].phase \in Phases /\ jobs[j].retried \in BOOLEAN
    /\ runningJobs \in 0..MaxConcurrentJobs + 1
    /\ waitingForSlot \in Seq(Ids)

Init ==
    /\ jobs = <<>>
    /\ runningJobs = 0
    /\ waitingForSlot = <<>>
    /\ startedJobs = 0

Unfinished(r) == \E j \in Ids : jobs[j].req = r /\ jobs[j].phase \notin Finished

EntryRejects(r) == r \in GuardedRequests /\ Unfinished(r)

RunJob(r, lineage, retried) ==
    LET id == startedJobs + 1
        added(phase) == [j \in 1..id |-> IF j = id THEN [req |-> r, lineage |-> lineage, phase |-> phase, retried |-> FALSE]
                                          ELSE IF j = retried THEN [jobs[j] EXCEPT !.retried = TRUE]
                                          ELSE jobs[j]]
    IN
    /\ startedJobs < MaxJobs
    /\ ~EntryRejects(r)
    /\ startedJobs' = id
    /\ IF runningJobs < MaxConcurrentJobs
       THEN /\ runningJobs' = runningJobs + 1
            /\ jobs' = added("granted")
            /\ UNCHANGED waitingForSlot
       ELSE /\ waitingForSlot' = Append(waitingForSlot, id)
            /\ jobs' = added("queued")
            /\ UNCHANGED runningJobs

Start(r) == RunJob(r, startedJobs + 1, 0)

RetryAllowed(j) == jobs[j].phase \in Finished /\ ~jobs[j].retried

Retry(j) ==
    /\ jobs[j].phase \in RetryFrom
    /\ RetryAllowed(j)
    /\ RunJob(jobs[j].req, jobs[j].lineage, j)

Resume(j) ==
    /\ jobs[j].phase = "granted"
    /\ jobs' = [jobs EXCEPT ![j].phase = "running"]
    /\ UNCHANGED <<runningJobs, waitingForSlot, startedJobs>>

Finish(j) ==
    /\ jobs[j].phase = "running"
    /\ \E outcome \in Finished :
         IF waitingForSlot /= <<>>
         THEN LET next == Head(waitingForSlot) IN
              /\ jobs' = [jobs EXCEPT ![j].phase = outcome, ![next].phase = "granted"]
              /\ waitingForSlot' = Tail(waitingForSlot)
              /\ UNCHANGED runningJobs
         ELSE /\ jobs' = [jobs EXCEPT ![j].phase = outcome]
              /\ runningJobs' = runningJobs - 1
              /\ UNCHANGED waitingForSlot
    /\ UNCHANGED startedJobs

EditorApiCall == \E r \in Requests : Start(r)
RetryJobCall == \E j \in Ids : Retry(j)
TakeSlotResolves == \E j \in Ids : Resume(j)
WorkSettles == \E j \in Ids : Finish(j)

Next == EditorApiCall \/ RetryJobCall \/ TakeSlotResolves \/ WorkSettles

Spec == Init /\ [][Next]_vars

-----------------------------------------------------------------------------
Holders == {j \in Ids : jobs[j].phase \in Holding}

SlotsWithinLimit == Cardinality(Holders) <= MaxConcurrentJobs

SlotCountMatches == runningJobs = Cardinality(Holders)

NoJobRunsTwice ==
    \A a, b \in Holders : a /= b => jobs[a].lineage /= jobs[b].lineage

OneUnfinishedPerRoom ==
    \A r \in GuardedRequests : Cardinality({j \in Ids : jobs[j].req = r /\ jobs[j].phase \notin Finished}) <= 1
=============================================================================
