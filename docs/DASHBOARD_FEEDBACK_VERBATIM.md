# Dashboard Feedback — Full Verbatim Text
## Source: User message, March 15, 2026
## Context: Dashboard set to "Past Week" view
## Screenshot: /<path>/workspace/image.jpg

---

Okay the dashboard loaded way faster. Well done; however there is still a lot of work to do. When I look at the past week:

First off it took 20 seconds probably to load.

There wasn't that clean animation that the selector went from today to past week like I described because it was so laggy. You got to fix that somehow.

You see how it says "updated 38 minutes ago"? I thought we agreed we were going to update this stuff every 15 minutes. Now I think we should update it every 15 minutes during business hours, which could be a configurable thing in settings. You know what it definitely should be. Make that a configurable thing in settings. It probably shouldn't refresh at all outside of business hours. That's a way to keep down our API usage. We don't need to go nuts overnight. Well I guess we do because Ignite webhooks will update, but do we need to be querying Gingr for reservation updates if no employees are in the building to make any updates? I don't know. That's something worth thinking about.

You'll see that in the past week it says 50 expected and 40 in-house. That is not right. You're telling me in the past seven days we've only had 50 dogs that were expected each individual day? In aggregate? No. In-house. Before we move on from expected for the past week, I think what that should do is look at the number of dogs that were scheduled to check in in the past week. Just get the raw number of how many were scheduled to come and then for in-house you just take the raw number of the dogs that checked in at that point. You'll be able to tell if there were 1,000 or 600 dogs expected and only 590 were in-house in the past week, then you know 10 canceled. That's useful.

Going home. I don't know if going home is useful at the past week view so maybe on the past week view when it changes to it, the going home text animates into canceled and it just does a manual subtraction of expected and in-house. There has to be a really cool animation for this, almost like a red bar crosses out going home live in an animated way and then it replaces with canceled and then the value of canceled animates in. I think you can do a really clean animation for that.

Okay occupancy 143%. What the fuck is this? How are you calculating this? What you should be doing is looking at the total number of rooms occupied in the past week and dividing that by the total number of rooms possible to be occupied in the past week. Look at the total number of rooms we have overnight multiplied by seven. Look at the total number of dogs we had just boarding overnight and then divide those and in-house. By the way going back to that, that is not just boarding; that's total; that's every dog so you'll want to make sure you're not counting tours in that.

Okay bookings, it says 10 in the past week. I know that's not right so I don't know how you're looking at it but in my head when I think of bookings, you're going to look at reservations and you're going to look at the reservation created date. How many reservations were created in the past week? Super important.

Zero tours. I know that's not right; you need to fix that one eval. I know that's not right either so I think in Gingr you can create an appointment called evaluate or create a reservation called evaluation. A lot of the time we don't do that; a lot of the time we'll just create a day care reservation and that day care reservation, because it's the first reservation they've had that stay care. You can programmatically tell they're getting their evaluation that day because it's the first time they've been with us and that's the only time we do evaluations.

Next remaining leads: 19. I am not going to check if this is right but essentially the value on the customer lifecycle page, in the leads module page, should say 19 records so that should be one-to-one with what's in the customer lifecycle.

We have renamed this to lapsed.

This value at risk, or this value of 3,940, is wrong because it needs to omit old records from gingr. If you go to customer lifecycle right now, you'll see there are no lapsed customers, which is also wrong. You need to omit old gingr records from the calculation in this dashboard. It should just be the lapsed ones that are not old. We need to change the logic for lapsed because right now it says zero customers lapsed. That's not right. This resort has been open for almost a decade and we do 600 dogs a week. You're telling me no one's lapsed? Bullshit. I think we set the threshold too low. I think it should be all customers who have lapsed in the last 90 days from the point of creating this. It should display those as lapsed and anyone over 90 days should be classified as old, dated from gingr.

It says nine outreaches. I haven't reached out to anybody. Are you counting the system-logged messages and life cycle? You shouldn't be.

10 converted: okay, I'm curious how the hell you're calculating that.

First-time spenders 90: that's really fucking high dude.

First-time spenders: that's amazing, 33.3 conversion rate. How the fuck are you calculating that?

12 new leads: look, that's fine. I'm okay with that number.

Daily tasks: I really like the EOD report, I really like checkout TV, I really like photos, I really like cash tips, and I really like checkout notes. Though I have not clicked it and tested it yet, I have also not tested the EOD report yet so those are things that I will need to do. Maybe you can log those as motion tasks for me.

Next average LTV: it should just be LTV. It's not an average; it's not just the customer. Maybe that's the way you should put it. I don't know; it just seems off to say LTV or average but maybe you're right.

There's no comma; it's just four digits in a row. There should be a comma.

Total clients: 4,824. I don't know if that's right. I'm pretty sure when we did our initial pull from gingr that I had something like 7,000 customers in customer lifecycle so where are you getting this figure from? Why is it so low?

Financial reporting: 188 transactions. That cannot be right. We do 650 dogs a week. How have we only transacted on 188 of those?

I just had a thought: the number of outstanding invoices would be an excellent metric to put on the dashboard, like a really good one. Add that as a motion task.

Average ticket price: I don't like the sound of that. I probably rephrase it to average transaction price.

Okay and back to the average transaction price: just verify that you're calculating it correctly.
Average transaction price: verify that you're calculating it correctly.
RevPAR: verify that you're calculating it correctly.
Zero refunds: I don't believe this. Please confirm that you're calculating this correctly.
The number refunded is zero. I don't believe this either.
Zero discounted and zero amount discounted: I don't believe those things.
I think you need to double-check those for me.

Next I've told you this before but the data on the Services page needs to match what we actually see in Operations Hub. That Baths figure, 0 of 0, actually, first off, the way that timeframes affect checklists and services is going to be a little nuanced. I think you should leave that as a motion task for me to explain. Let's not prioritize it right now so create a motion task for me to do that.

Attendance and Inventory buttons on the dashboard are dashes but they need to be icons, just like EOD report, just like Check Out TV, just like Photos.

On these graphs I don't like that the colors are so transparent and they're fading out as they go down. These need to be solid colors and really pop. I don't think they pop right now.

A lot of the time the X axis is not useful. Right now we're at the past week and it's only listing 4 dates. Shouldn't it list 7? It's a week. It's not that many data points.

It would also be nice if for each X axis you only had one data point connecting to it. I think that if you hover over the axis there should only be 7. This is actually a good question: should there only be 7 data points at that stage to be completely accurate? I don't know. Maybe it should be. Maybe it should be 7 data points because it's a week. Why are there a million bumps and valleys?

Maybe you should have a smoothed-out line that shows the averages in gray or something. That's kind of what we're doing now with these graphs. You show a continuous rounding graph. There's probably a term for it. It's not a line of best fit. It's something you can do. I'm sure there is a statistical term for it but you're smoothening out the lines to make it not jagged and make it round like you have already.

In my mind I feel like if you're looking at a graph of a week of revenue, you should see seven data points connected via a jagged graph with solid color beneath it, no gradient. Each value on the X-axis, maybe it should have a very subtle vertical line to its data point with a bigger dot on that line. This applies to both cash basis revenue and accrual revenue.

This revenue split concept needs development but I don't want to do it right now. Please create a motion task for me to adjust or spec out the revenue split concept.

Okay this is obviously a lot of information and a lot of nitpicking. Once we get these things solved the app is basically ready to go. What I need you to do now is I don't want you to do any of the work. I want you to simply interpret my words here. Don't miss a single thing. Review it five times. Delegate to a quorum of agents to compare interpretation and then bring me a committee of agents I want you to work with on this. I want multiple different bots looking and interpreting these messages and attaching a screenshot and coming up with a very clear action plan on what agents can do. Kind of categorize the improvements and make it so I can just create prompts in motion or you create prompts for me in motion after you've spoken to your quorum or committee of agents. That way I can just go ahead and create multiple Perplexity computer sessions and nothing is lost from all this data I'm giving you. Please get every detail correct; you can't miss any.

---

## User's Explicit Instructions
1. Do NOT do any coding work
2. Interpret every detail — don't miss a single thing
3. Delegate to multiple agents (quorum/committee) to cross-check interpretation
4. Categorize improvements
5. Produce Motion-ready prompts that can be copy-pasted into new Perplexity sessions
6. Create Motion tasks where explicitly requested
