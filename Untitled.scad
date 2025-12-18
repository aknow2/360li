include <BOSL2/std.scad>
$fn=128;
N=24;


module stall(){
    path = circle(r=55, $fn=N);
theta = lerpn(0,360,N,endpoint=false);
scale = [for(t=theta) sin(8*t)/5+1.2];
    
difference() {
path_sweep(circle(r=20, $fn=6), path3d(path), closed=true, scale=scale);



}

rotate([0,0,20])
translate([0,0,-8]) {
   
path = circle(r=50, $fn=N);
theta = lerpn(0,360,N,endpoint=false);
scale = [for(t=theta) sin(8*t)/5+1];

difference() {
path_sweep(circle(r=20, $fn=6), path3d(path), closed=true, scale=scale);

}
}


}



translate([0,0,20])
difference(){
torus(r_maj=42, r_min=12);

}

difference(){
 stall();
count =360;

translate([0,0,-20])
for(i= [0:4:count]){
    rotate([0,0,i])
    translate([65,0,sin(20*i)*8])
rotate([0,-60,0])
cylinder(d=2,h=80,center=true,$fn=6);
}

cylinder(d=80,h=200,center=true,$fn=6);
     translate([0,0,-30])
 rotate([90,0,0])

    cylinder(r=20,h=200, $fn=6);
}




